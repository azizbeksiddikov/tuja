// Money helpers. Amounts are integer minor units (ISO-4217 exponents) + currency code.
// Pure module: safe on client and server, no app imports.

export const SUPPORTED_CURRENCIES = ["UZS", "KRW", "USD", "EUR", "RUB"] as const;
export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

const EXPONENT: Record<string, number> = { KRW: 0, JPY: 0 };
export const exponentOf = (ccy: string) => EXPONENT[ccy.toUpperCase()] ?? 2;
export const divisorOf = (ccy: string) => 10 ** exponentOf(ccy);

export function toMajor(minor: bigint | number, ccy: string): number {
  return Number(minor) / divisorOf(ccy);
}

export function toMinor(major: number, ccy: string): bigint {
  return BigInt(Math.round(major * divisorOf(ccy)));
}

export function formatMoney(minor: bigint | number, ccy: string, opts: { signed?: boolean } = {}): string {
  const major = toMajor(minor, ccy);
  // UZS is shown without tiyin (nobody uses them in practice); KRW has no minor unit.
  const digits = ccy === "UZS" ? 0 : exponentOf(ccy);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: ccy,
    currencyDisplay: ccy === "UZS" ? "code" : "symbol",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: opts.signed ? "exceptZero" : "auto",
  }).format(major);
}

/** UZS per 1 unit of currency. UZS itself is 1. */
export type RateTable = Record<string, number>;

/**
 * Convert minor units between currencies through UZS (CBU publishes everything against UZS).
 * Note: CBU quotes KRW with only 2 decimals (e.g. 9.04 UZS), so KRW<->USD carries ~0.05% rounding error.
 */
export function convertMinor(minor: bigint | number, from: string, to: string, rates: RateTable): bigint {
  if (from === to) return BigInt(minor);
  const rFrom = from === "UZS" ? 1 : rates[from];
  const rTo = to === "UZS" ? 1 : rates[to];
  if (!rFrom || !rTo) throw new Error(`No FX rate for ${!rFrom ? from : to}`);
  const uzs = toMajor(minor, from) * rFrom;
  return toMinor(uzs / rTo, to);
}

export function isSupportedCurrency(c: string): c is CurrencyCode {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(c);
}
