import { prisma } from "@/lib/db";
import { getRates, refreshRatesIfStale } from "@/lib/fx";
import { convertMinor, type RateTable } from "@/lib/money";
import { NON_SPEND_CATEGORIES } from "@/lib/categories";
import type { Prisma } from "@/generated/prisma/client";

// Every function here takes the authenticated userId and scopes every query by it.
// Nothing reads an id from the URL without checking ownership (fixes the tutorial's IDOR).

export type AccountView = {
  id: string;
  name: string;
  institution: string;
  mask: string | null;
  type: string;
  subtype: string | null;
  currency: string;
  balanceMinor: number;
  source: string;
};

export type TxnView = {
  id: string;
  accountId: string;
  accountName: string;
  bookedAt: string;
  merchant: string;
  category: string;
  channel: string;
  amountMinor: number;
  currency: string;
  pending: boolean;
  memo: string | null;
};

export async function loadRates(date?: Date) {
  if (!date) await refreshRatesIfStale();
  return getRates(date);
}

export async function getAccounts(userId: string): Promise<AccountView[]> {
  const rows = await prisma.bankAccount.findMany({ where: { userId }, orderBy: [{ source: "asc" }, { createdAt: "asc" }] });
  return rows.map((a) => ({
    id: a.id,
    name: a.name,
    institution: a.institution,
    mask: a.mask,
    type: a.type,
    subtype: a.subtype,
    currency: a.currency.trim(),
    balanceMinor: Number(a.balanceMinor),
    source: a.source,
  }));
}

/** Returns the account only if it belongs to the user. */
export async function getOwnAccount(userId: string, accountId: string) {
  return prisma.bankAccount.findFirst({ where: { id: accountId, userId } });
}

export function sumIn(items: { amountMinor: number; currency: string }[], ccy: string, rates: RateTable) {
  return items.reduce((s, i) => s + Number(convertMinor(i.amountMinor, i.currency, ccy, rates)), 0);
}

export type TxnFilter = {
  accountId?: string;
  category?: string;
  q?: string;
  from?: string; // YYYY-MM-DD inclusive
  to?: string; // YYYY-MM-DD inclusive
  direction?: "in" | "out";
  minAmount?: number; // major units, absolute, in the txn currency
  currency?: string;
  limit?: number;
  offset?: number;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function buildTxnWhere(userId: string, f: TxnFilter): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = { userId };
  if (f.accountId) where.accountId = f.accountId; // still AND userId, so a foreign id matches nothing
  if (f.category) where.category = f.category;
  if (f.currency) where.currency = f.currency.toUpperCase();
  if (f.q) where.OR = [{ merchant: { contains: f.q, mode: "insensitive" } }, { memo: { contains: f.q, mode: "insensitive" } }];
  const booked: Prisma.DateTimeFilter = {};
  if (f.from && DATE.test(f.from)) booked.gte = new Date(`${f.from}T00:00:00Z`);
  if (f.to && DATE.test(f.to)) booked.lte = new Date(`${f.to}T00:00:00Z`);
  if (booked.gte || booked.lte) where.bookedAt = booked;
  if (f.direction === "in") where.amountMinor = { gt: 0 };
  if (f.direction === "out") where.amountMinor = { lt: 0 };
  return where;
}

export async function listTransactions(userId: string, f: TxnFilter = {}): Promise<{ items: TxnView[]; total: number }> {
  const where = buildTxnWhere(userId, f);
  const [rows, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: { account: { select: { name: true } } },
      orderBy: [{ bookedAt: "desc" }, { createdAt: "desc" }],
      take: Math.min(f.limit ?? 50, 500),
      skip: f.offset ?? 0,
    }),
    prisma.transaction.count({ where }),
  ]);
  return {
    total,
    items: rows.map((t) => ({
      id: t.id,
      accountId: t.accountId,
      accountName: t.account.name,
      bookedAt: t.bookedAt.toISOString().slice(0, 10),
      merchant: t.merchant,
      category: t.category,
      channel: t.channel,
      amountMinor: Number(t.amountMinor),
      currency: t.currency.trim(),
      pending: t.pending,
      memo: t.memo,
    })),
  };
}

export async function getCategories(userId: string): Promise<string[]> {
  const rows = await prisma.transaction.findMany({ where: { userId }, distinct: ["category"], select: { category: true }, orderBy: { category: "asc" } });
  return rows.map((r) => r.category);
}

export type CategorySpend = { category: string; amountMinor: number; count: number };

/** Outflows grouped by category (excluding own-account transfers), converted to `ccy`. */
export async function spendingByCategory(userId: string, from: string, to: string, ccy: string, rates: RateTable): Promise<CategorySpend[]> {
  const where = buildTxnWhere(userId, { from, to, direction: "out" });
  where.category = { notIn: NON_SPEND_CATEGORIES };
  const groups = await prisma.transaction.groupBy({ by: ["category", "currency"], where, _sum: { amountMinor: true }, _count: true });
  const map = new Map<string, CategorySpend>();
  for (const g of groups) {
    const amt = -Number(convertMinor(Number(g._sum.amountMinor ?? 0), g.currency.trim(), ccy, rates));
    const cur = map.get(g.category) ?? { category: g.category, amountMinor: 0, count: 0 };
    cur.amountMinor += amt;
    cur.count += g._count;
    map.set(g.category, cur);
  }
  return [...map.values()].sort((a, b) => b.amountMinor - a.amountMinor);
}

export async function cashflow(userId: string, from: string, to: string, ccy: string, rates: RateTable) {
  const where = buildTxnWhere(userId, { from, to });
  where.category = { notIn: NON_SPEND_CATEGORIES };
  const groups = await prisma.transaction.groupBy({ by: ["currency"], where: { ...where, amountMinor: { gt: 0 } }, _sum: { amountMinor: true } });
  const out = await prisma.transaction.groupBy({ by: ["currency"], where: { ...where, amountMinor: { lt: 0 } }, _sum: { amountMinor: true } });
  const conv = (gs: typeof groups) => gs.reduce((s, g) => s + Number(convertMinor(Number(g._sum.amountMinor ?? 0), g.currency.trim(), ccy, rates)), 0);
  return { incomeMinor: conv(groups), spendMinor: -conv(out) };
}

export const iso = (d: Date) => d.toISOString().slice(0, 10);
export function monthRange(offset = 0, now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 0));
  return { from: iso(start), to: iso(end), label: start.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) };
}
