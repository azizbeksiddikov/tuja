import { prisma } from "./db";
import { SUPPORTED_CURRENCIES, type RateTable } from "./money";

// Rate providers, tried in order. Rates are cached in fx_rates, so a failing provider never blocks a page.
//  1. Central Bank of Uzbekistan open JSON API (no key). Primary: the official UZS rate.
//       latest:     https://cbu.uz/uz/arkhiv-kursov-valyut/json/
//       historical: https://cbu.uz/uz/arkhiv-kursov-valyut/json/all/YYYY-MM-DD/
//     cbu.uz is often unreachable from servers outside Central Asia, hence a short timeout.
//  2. ExchangeRate-API open access endpoint (no key, daily updates, attribution required:
//     https://www.exchangerate-api.com/docs/free). Latest rates only.
//  3. FALLBACK_RATES below (static).
const CBU_BASE = "https://cbu.uz/uz/arkhiv-kursov-valyut/json/";
const ER_API_URL = "https://open.er-api.com/v6/latest/USD";
const CBU_TIMEOUT_MS = 3000;
const ER_API_TIMEOUT_MS = 5000;

export type RateSource = "cbu" | "er-api" | "fallback";

export const RATE_SOURCE_LABEL: Record<RateSource, string> = {
  cbu: "Central Bank of Uzbekistan",
  "er-api": "ExchangeRate-API (open.er-api.com)",
  fallback: "built-in fallback rates",
};

/** Used only if the DB has no rates and every provider is unreachable (UZS per unit, approx. Oct 2026). */
export const FALLBACK_RATES: RateTable = { UZS: 1, USD: 11838.92, EUR: 13750, RUB: 146, KRW: 8.9 };

export interface RateRow {
  code: string;
  date: Date;
  rateUzs: number;
}

export interface CbuRow {
  Ccy: string;
  Rate: string;
  Nominal: string;
  Date: string; // dd.mm.yyyy
}

export function parseCbuRows(rows: CbuRow[], only: readonly string[] = SUPPORTED_CURRENCIES): RateRow[] {
  return rows
    .filter((r) => only.includes(r.Ccy))
    .map((r) => {
      const [d, m, y] = r.Date.split(".");
      const nominal = Number(r.Nominal) || 1;
      return { code: r.Ccy, date: new Date(`${y}-${m}-${d}T00:00:00Z`), rateUzs: Number(r.Rate) / nominal };
    })
    .filter((r) => Number.isFinite(r.rateUzs) && r.rateUzs > 0);
}

export interface ErApiResponse {
  result: string;
  base_code: string;
  time_last_update_unix: number;
  rates: Record<string, number>;
}

/** open.er-api.com gives units per 1 USD; convert to UZS per unit like CBU. */
export function parseErApi(body: ErApiResponse, only: readonly string[] = SUPPORTED_CURRENCIES): RateRow[] {
  if (body?.result !== "success" || body.base_code !== "USD" || !body.rates) throw new Error("open.er-api.com: unexpected response");
  const uzsPerUsd = Number(body.rates.UZS);
  if (!Number.isFinite(uzsPerUsd) || uzsPerUsd <= 0) throw new Error("open.er-api.com: no UZS rate");
  const t = new Date((Number(body.time_last_update_unix) || Date.now() / 1000) * 1000);
  const date = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  return only
    .filter((c) => c !== "UZS")
    .map((code) => ({ code, date, rateUzs: uzsPerUsd / Number(body.rates[code]) }))
    .filter((r) => Number.isFinite(r.rateUzs) && r.rateUzs > 0);
}

type FetchFn = typeof fetch;

export async function fetchCbuRates(date?: string, fetchFn: FetchFn = fetch, timeoutMs = CBU_TIMEOUT_MS): Promise<RateRow[]> {
  const url = date ? `${CBU_BASE}all/${date}/` : CBU_BASE;
  const res = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  if (!res.ok) throw new Error(`cbu.uz HTTP ${res.status}`);
  const rows = parseCbuRows((await res.json()) as CbuRow[]);
  if (!rows.some((r) => r.code === "USD")) throw new Error("cbu.uz: no USD rate");
  return rows;
}

export async function fetchErApiRates(fetchFn: FetchFn = fetch, timeoutMs = ER_API_TIMEOUT_MS): Promise<RateRow[]> {
  const res = await fetchFn(ER_API_URL, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  if (!res.ok) throw new Error(`open.er-api.com HTTP ${res.status}`);
  return parseErApi((await res.json()) as ErApiResponse);
}

/** Latest rates from the first provider that answers. Throws only if every live provider fails. */
export async function fetchLatestRates(fetchFn: FetchFn = fetch): Promise<{ rows: RateRow[]; source: Exclude<RateSource, "fallback"> }> {
  const errors: string[] = [];
  try {
    return { rows: await fetchCbuRates(undefined, fetchFn), source: "cbu" };
  } catch (e) {
    errors.push(`cbu: ${(e as Error).message}`);
  }
  try {
    return { rows: await fetchErApiRates(fetchFn), source: "er-api" };
  } catch (e) {
    errors.push(`er-api: ${(e as Error).message}`);
  }
  throw new Error(`all FX providers failed (${errors.join("; ")})`);
}

/** CBU rows overwrite anything for that day; secondary-provider rows never overwrite an existing (CBU) row. */
export async function storeRates(rows: RateRow[], source: Exclude<RateSource, "fallback"> = "cbu") {
  if (source !== "cbu") {
    const r = await prisma.fxRate.createMany({ data: rows.map((x) => ({ date: x.date, code: x.code, rateUzs: x.rateUzs, source })), skipDuplicates: true });
    return r.count;
  }
  for (const r of rows) {
    await prisma.fxRate.upsert({
      where: { date_code: { date: r.date, code: r.code } },
      create: { date: r.date, code: r.code, rateUzs: r.rateUzs, source },
      update: { rateUzs: r.rateUzs, source },
    });
  }
  return rows.length;
}

let lastAttempt = 0;
let inflight: Promise<void> | null = null;

async function refreshNow() {
  try {
    const { rows, source } = await fetchLatestRates();
    await storeRates(rows, source);
  } catch (e) {
    console.warn("[fx] refresh failed:", (e as Error).message);
  }
}

/**
 * Refresh today's rates at most once per hour per process, in the background. Never throws.
 * Pages only wait (briefly) when the database has no rates at all.
 */
export async function refreshRatesIfStale(): Promise<void> {
  try {
    const latest = await prisma.fxRate.findFirst({ orderBy: { date: "desc" } });
    const today = new Date().toISOString().slice(0, 10);
    const fresh = latest && latest.date.toISOString().slice(0, 10) >= today;
    if (fresh || inflight || Date.now() - lastAttempt < 3_600_000) return;
    lastAttempt = Date.now();
    inflight = refreshNow().finally(() => (inflight = null));
    if (!latest) await Promise.race([inflight, new Promise((r) => setTimeout(r, CBU_TIMEOUT_MS + ER_API_TIMEOUT_MS))]);
  } catch (e) {
    console.warn("[fx] refresh check failed:", (e as Error).message);
  }
}

/** Latest stored rate per currency on or before `date` (default: now); the earliest stored rates if none are older. */
export async function getRates(date?: Date): Promise<{ rates: RateTable; asOf: string | null; source: RateSource }> {
  const on = date ?? new Date();
  type Row = { code: string; rate_uzs: string; date: Date; source: string };
  let rows = await prisma.$queryRaw<Row[]>`
    SELECT DISTINCT ON (code) code, rate_uzs::text, date, source
    FROM fx_rates WHERE date <= ${on}::date
    ORDER BY code, date DESC`;
  if (!rows.length) {
    rows = await prisma.$queryRaw<Row[]>`
      SELECT DISTINCT ON (code) code, rate_uzs::text, date, source
      FROM fx_rates ORDER BY code, date ASC`;
  }
  if (!rows.length) return { rates: { ...FALLBACK_RATES }, asOf: null, source: "fallback" };
  const rates: RateTable = { UZS: 1 };
  let newest = rows[0];
  for (const r of rows) {
    rates[r.code.trim()] = Number(r.rate_uzs);
    if (r.date > newest.date) newest = r;
  }
  for (const [k, v] of Object.entries(FALLBACK_RATES)) rates[k] ??= v;
  const usd = rows.find((r) => r.code.trim() === "USD") ?? newest;
  const source: RateSource = usd.source === "er-api" ? "er-api" : "cbu";
  return { rates, asOf: newest.date.toISOString().slice(0, 10), source };
}
