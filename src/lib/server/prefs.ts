import "server-only";
import { cookies } from "next/headers";
import { isSupportedCurrency, SUPPORTED_CURRENCIES } from "@/lib/money";

export const DISPLAY_CURRENCIES = ["KRW", "UZS", "USD"] as const;
export const CCY_COOKIE = "tuja_ccy";

/** Display currency comes from a cookie so the shared read-only demo account never needs a DB write. */
export async function getDisplayCurrency(fallback = "KRW"): Promise<string> {
  const c = (await cookies()).get(CCY_COOKIE)?.value?.toUpperCase();
  if (c && isSupportedCurrency(c)) return c;
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(fallback) ? fallback : "KRW";
}
