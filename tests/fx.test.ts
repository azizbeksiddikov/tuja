// FX provider chain: CBU first, then open.er-api.com, then static fallback. Fetch is mocked (no network).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchLatestRates, getRates, parseErApi, storeRates, type ErApiResponse } from "@/lib/fx";
import { prisma } from "@/lib/db";

const CBU_BODY = [
  { Ccy: "USD", Rate: "11838.92", Nominal: "1", Date: "24.10.2026" },
  { Ccy: "KRW", Rate: "8.94", Nominal: "1", Date: "24.10.2026" },
  { Ccy: "GBP", Rate: "15000", Nominal: "1", Date: "24.10.2026" },
];
const ER_BODY: ErApiResponse = {
  result: "success",
  base_code: "USD",
  time_last_update_unix: Date.UTC(2026, 9, 25, 0, 2) / 1000,
  rates: { USD: 1, UZS: 11871.2, KRW: 1324.8, EUR: 0.8926, RUB: 81.14 },
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const timeout = () => Promise.reject(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }));

function mockFetch(handlers: { cbu: () => Promise<Response>; er: () => Promise<Response> }) {
  const calls: string[] = [];
  const fn = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    return url.includes("cbu.uz") ? handlers.cbu() : handlers.er();
  }) as typeof fetch;
  return { fn, calls };
}

describe("FX provider chain", () => {
  it("uses CBU when it answers and does not call the backup", async () => {
    const m = mockFetch({ cbu: async () => json(CBU_BODY), er: async () => json(ER_BODY) });
    const r = await fetchLatestRates(m.fn);
    expect(r.source).toBe("cbu");
    expect(r.rows.find((x) => x.code === "USD")?.rateUzs).toBeCloseTo(11838.92);
    expect(r.rows.some((x) => x.code === "GBP")).toBe(false);
    expect(m.calls).toHaveLength(1);
  });

  it("falls back to open.er-api.com when cbu.uz times out", async () => {
    const m = mockFetch({ cbu: timeout, er: async () => json(ER_BODY) });
    const r = await fetchLatestRates(m.fn);
    expect(r.source).toBe("er-api");
    expect(m.calls.map((u) => new URL(u).host)).toEqual(["cbu.uz", "open.er-api.com"]);
    const usd = r.rows.find((x) => x.code === "USD")!;
    const krw = r.rows.find((x) => x.code === "KRW")!;
    expect(usd.rateUzs).toBeCloseTo(11871.2);
    expect(krw.rateUzs).toBeCloseTo(11871.2 / 1324.8, 4); // ≈ 8.96 UZS per won
    expect(usd.date.toISOString().slice(0, 10)).toBe("2026-10-25");
  });

  it("falls back on CBU HTTP errors and on CBU bodies without USD", async () => {
    for (const cbu of [async () => json({}, 502), async () => json([])]) {
      const r = await fetchLatestRates(mockFetch({ cbu, er: async () => json(ER_BODY) }).fn);
      expect(r.source).toBe("er-api");
    }
  });

  it("throws when every live provider fails (callers then use stored or static rates)", async () => {
    const m = mockFetch({ cbu: timeout, er: async () => json({ result: "error" }) });
    await expect(fetchLatestRates(m.fn)).rejects.toThrow(/all FX providers failed/);
  });

  it("rejects er-api responses without UZS or with another base", () => {
    expect(() => parseErApi({ ...ER_BODY, rates: { USD: 1, KRW: 1300 } })).toThrow(/UZS/);
    expect(() => parseErApi({ ...ER_BODY, base_code: "EUR" })).toThrow();
  });
});

// Storage rules against the dev Postgres, on dates far in the past so real rates are untouched.
describe("FX storage (DB)", () => {
  let up = false;
  const day = new Date("2000-01-03T00:00:00Z");
  const clean = () => prisma.fxRate.deleteMany({ where: { date: { lte: new Date("2000-01-31T00:00:00Z") } } });
  beforeAll(async () => {
    try {
      const older = await prisma.fxRate.count({ where: { date: { lte: new Date("2000-01-31T00:00:00Z") } } });
      up = older === 0;
    } catch {
      up = false;
    }
  });
  afterAll(async () => {
    if (up) await clean();
    await prisma.$disconnect();
  });

  it("backup-provider rows never overwrite a CBU row, CBU rows overwrite backup rows; source is reported", async ({ skip }) => {
    if (!up) skip();
    await storeRates([{ code: "USD", date: day, rateUzs: 100 }], "er-api");
    expect((await getRates(day)).source).toBe("er-api");
    await storeRates([{ code: "USD", date: day, rateUzs: 200 }], "cbu");
    await storeRates([{ code: "USD", date: day, rateUzs: 300 }], "er-api");
    const r = await getRates(day);
    expect(r.source).toBe("cbu");
    expect(r.rates.USD).toBe(200);
    expect(r.asOf).toBe("2000-01-03");
  });
});
