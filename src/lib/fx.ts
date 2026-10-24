import { prisma } from "./db";
import { SUPPORTED_CURRENCIES, type RateTable } from "./money";

// Central Bank of Uzbekistan open JSON API (no key).
//   latest:     https://cbu.uz/uz/arkhiv-kursov-valyut/json/
//   historical: https://cbu.uz/uz/arkhiv-kursov-valyut/json/all/YYYY-MM-DD/
const CBU_BASE = "https://cbu.uz/uz/arkhiv-kursov-valyut/json/";

/** Used only if the DB has no rates and cbu.uz is unreachable (UZS per unit, approx. Oct 2026). */
export const FALLBACK_RATES: RateTable = { UZS: 1, USD: 11838.92, EUR: 13750, RUB: 146, KRW: 8.9 };

export interface CbuRow {
  Ccy: string;
  Rate: string;
  Nominal: string;
  Date: string; // dd.mm.yyyy
}

export function parseCbuRows(rows: CbuRow[], only: readonly string[] = SUPPORTED_CURRENCIES) {
  return rows
    .filter((r) => only.includes(r.Ccy))
    .map((r) => {
      const [d, m, y] = r.Date.split(".");
      const nominal = Number(r.Nominal) || 1;
      return { code: r.Ccy, date: new Date(`${y}-${m}-${d}T00:00:00Z`), rateUzs: Number(r.Rate) / nominal };
    })
    .filter((r) => Number.isFinite(r.rateUzs) && r.rateUzs > 0);
}

export async function fetchCbuRates(date?: string): Promise<ReturnType<typeof parseCbuRows>> {
  const url = date ? `${CBU_BASE}all/${date}/` : CBU_BASE;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!res.ok) throw new Error(`cbu.uz HTTP ${res.status}`);
  return parseCbuRows((await res.json()) as CbuRow[]);
}

export async function storeRates(rows: ReturnType<typeof parseCbuRows>) {
  for (const r of rows) {
    await prisma.fxRate.upsert({
      where: { date_code: { date: r.date, code: r.code } },
      create: { date: r.date, code: r.code, rateUzs: r.rateUzs },
      update: { rateUzs: r.rateUzs },
    });
  }
  return rows.length;
}

let lastAttempt = 0;

/** Fetch today's rates at most once per hour per process; never throws. */
export async function refreshRatesIfStale(): Promise<void> {
  try {
    const latest = await prisma.fxRate.findFirst({ orderBy: { date: "desc" } });
    const today = new Date().toISOString().slice(0, 10);
    const fresh = latest && latest.date.toISOString().slice(0, 10) >= today;
    if (fresh || Date.now() - lastAttempt < 3_600_000) return;
    lastAttempt = Date.now();
    await storeRates(await fetchCbuRates());
  } catch (e) {
    console.warn("[fx] refresh failed:", (e as Error).message);
  }
}

/** Latest stored rate per currency on or before `date` (default: now). */
export async function getRates(date?: Date): Promise<{ rates: RateTable; asOf: string | null; source: "cbu" | "fallback" }> {
  const on = date ?? new Date();
  const rows = await prisma.$queryRaw<{ code: string; rate_uzs: string; date: Date }[]>`
    SELECT DISTINCT ON (code) code, rate_uzs::text, date
    FROM fx_rates WHERE date <= ${on}::date
    ORDER BY code, date DESC`;
  if (!rows.length) return { rates: { ...FALLBACK_RATES }, asOf: null, source: "fallback" };
  const rates: RateTable = { UZS: 1 };
  let asOf = rows[0].date;
  for (const r of rows) {
    rates[r.code.trim()] = Number(r.rate_uzs);
    if (r.date > asOf) asOf = r.date;
  }
  for (const [k, v] of Object.entries(FALLBACK_RATES)) rates[k] ??= v;
  return { rates, asOf: asOf.toISOString().slice(0, 10), source: "cbu" };
}
