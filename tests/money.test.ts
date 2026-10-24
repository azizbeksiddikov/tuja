import { describe, expect, it } from "vitest";
import { convertMinor, formatMoney, toMinor, toMajor } from "@/lib/money";
import { parseCbuRows } from "@/lib/fx";
import { generateDemoTransactions } from "@/lib/demo/generate";

const rates = { UZS: 1, USD: 11838.92, KRW: 8.94, EUR: 13248.94 };

describe("money", () => {
  it("uses ISO exponents (KRW 0, USD/UZS 2)", () => {
    expect(toMinor(1500, "KRW")).toBe(1500n);
    expect(toMinor(15.49, "USD")).toBe(1549n);
    expect(toMajor(150_000_00n, "UZS")).toBe(150000);
  });

  it("converts through UZS", () => {
    expect(convertMinor(100_00n, "USD", "UZS", rates)).toBe(1_183_892_00n);
    expect(convertMinor(10_000n, "KRW", "UZS", rates)).toBe(89_400_00n);
    // 1 USD -> KRW = 11838.92 / 8.94 = 1324.27 -> 1324 won
    expect(convertMinor(1_00n, "USD", "KRW", rates)).toBe(1324n);
    expect(convertMinor(5n, "KRW", "KRW", rates)).toBe(5n);
  });

  it("throws on unknown currency", () => {
    expect(() => convertMinor(1n, "XYZ", "UZS", rates)).toThrow();
  });

  it("formats", () => {
    expect(formatMoney(1549n, "USD")).toBe("$15.49");
    expect(formatMoney(-450000n, "KRW")).toBe("-₩450,000");
    expect(formatMoney(3_000_000_00n, "UZS").replace(/\s/g, " ")).toBe("UZS 3,000,000");
  });
});

describe("CBU parsing", () => {
  it("normalizes nominal and date", () => {
    const rows = parseCbuRows([
      { Ccy: "USD", Rate: "11838.92", Nominal: "1", Date: "24.10.2026" },
      { Ccy: "KRW", Rate: "89.40", Nominal: "10", Date: "24.10.2026" },
      { Ccy: "XAU", Rate: "1", Nominal: "1", Date: "24.10.2026" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[1].code).toBe("KRW");
    expect(rows[1].rateUzs).toBeCloseTo(8.94, 8);
    expect(rows[0].date.toISOString().slice(0, 10)).toBe("2026-10-24");
  });
});

describe("demo generator", () => {
  it("is deterministic and covers ~6 months in 3 currencies", () => {
    const end = new Date("2026-10-24T00:00:00Z");
    const a = generateDemoTransactions(end);
    const b = generateDemoTransactions(end);
    expect(a).toEqual(b);
    expect(new Set(a.map((t) => t.currency))).toEqual(new Set(["KRW", "UZS", "USD"]));
    expect(a[0].bookedAt >= "2026-04-24").toBe(true);
    expect(a.length).toBeGreaterThan(200);
  });
});
