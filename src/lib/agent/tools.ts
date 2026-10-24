import { z } from "zod";
import { prisma, pool } from "@/lib/db";
import { config } from "@/lib/config";
import { convertMinor, formatMoney, toMajor, toMinor, isSupportedCurrency, type RateTable } from "@/lib/money";
import { runGuardedQuery, type GuardPolicy } from "@/lib/pg-guard";
import { getAccounts, getRates, iso, listTransactions, buildTxnWhere } from "./deps";
import { NON_SPEND_CATEGORIES } from "@/lib/categories";

// Tools the Gemini agent may call. Every tool receives the authenticated userId from the server
// (never from the model) and is read-only. There are no write tools: the assistant cannot move money.

export const SQL_POLICY: GuardPolicy = { allowedRelations: ["v_transactions", "v_accounts", "v_fx_rates"] };

export type ToolContext = { userId: string; displayCurrency: string };
export type ToolOutput = { ok: boolean; data: unknown; sql?: string; blocked?: boolean; summary: string };

const ccy = z.string().trim().toUpperCase().refine(isSupportedCurrency, "Use one of UZS, KRW, USD, EUR, RUB");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const money = (minor: number, c: string) => ({ amount: toMajor(minor, c), currency: c, formatted: formatMoney(minor, c) });

const schemas = {
  get_balances: z.object({ currency: ccy.optional() }),
  search_transactions: z.object({
    query: z.string().max(80).optional(),
    category: z.string().max(40).optional(),
    account_name: z.string().max(80).optional(),
    from: date.optional(),
    to: date.optional(),
    direction: z.enum(["in", "out"]).optional(),
    currency: ccy.optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  spending_summary: z.object({
    from: date,
    to: date,
    group_by: z.enum(["category", "merchant", "month", "account"]).default("category"),
    currency: ccy.optional(),
    direction: z.enum(["out", "in"]).default("out"),
    category: z.string().max(40).optional(),
    include_transfers: z.boolean().optional(),
  }),
  convert: z.object({ amount: z.number().finite(), from: ccy, to: ccy, date: date.optional() }),
  run_readonly_sql: z.object({ sql: z.string().min(1).max(4000), purpose: z.string().max(200).optional() }),
};

export type ToolName = keyof typeof schemas;

/** JSON Schemas sent to Gemini (`parametersJsonSchema`). */
export const TOOL_DECLARATIONS = [
  {
    name: "get_balances",
    description: "Current balance of each of the user's accounts in its own currency, plus each balance and the total converted to `currency` at the latest CBU rate.",
    parametersJsonSchema: {
      type: "object",
      properties: { currency: { type: "string", description: "Currency for totals: UZS, KRW, USD, EUR or RUB. Default: the user's display currency." } },
    },
  },
  {
    name: "search_transactions",
    description: "Find individual transactions. Returns up to `limit` newest matches plus the total match count and exact sums per original currency. Amounts are signed: negative = money out.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Case-insensitive text matched against merchant and memo, e.g. 'Netflix', 'GS25'." },
        category: { type: "string", description: "Exact category name." },
        account_name: { type: "string", description: "Account name (partial match)." },
        from: { type: "string", description: "Start date YYYY-MM-DD, inclusive." },
        to: { type: "string", description: "End date YYYY-MM-DD, inclusive." },
        direction: { type: "string", enum: ["in", "out"] },
        currency: { type: "string", description: "Only transactions in this original currency." },
        limit: { type: "integer", description: "1-50, default 20." },
      },
    },
  },
  {
    name: "spending_summary",
    description: "Totals over a date range grouped by category, merchant, month or account, converted to one currency at the latest CBU rate (also returns per-original-currency totals). Excludes transfers between own accounts unless include_transfers=true. direction=out sums money spent (as positive numbers), direction=in sums money received.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Start date YYYY-MM-DD, inclusive." },
        to: { type: "string", description: "End date YYYY-MM-DD, inclusive." },
        group_by: { type: "string", enum: ["category", "merchant", "month", "account"] },
        currency: { type: "string", description: "Target currency. Default: user's display currency." },
        direction: { type: "string", enum: ["out", "in"] },
        category: { type: "string", description: "Optional: only this category." },
        include_transfers: { type: "boolean" },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "convert",
    description: "Convert an amount between UZS, KRW, USD, EUR, RUB using Central Bank of Uzbekistan rates (latest, or the latest on/before `date`).",
    parametersJsonSchema: {
      type: "object",
      properties: { amount: { type: "number" }, from: { type: "string" }, to: { type: "string" }, date: { type: "string", description: "YYYY-MM-DD, optional" } },
      required: ["amount", "from", "to"],
    },
  },
  {
    name: "run_readonly_sql",
    description:
      "Run ONE read-only PostgreSQL SELECT for questions the other tools cannot answer. Only these views exist: " +
      "v_transactions(id, account_id, account_name, booked_at date, merchant, category, channel, currency, amount_minor bigint, amount numeric (major units, signed, negative = out), direction 'in'|'out', pending, memo), " +
      "v_accounts(id, name, institution, type, subtype, currency, balance_minor, balance numeric), " +
      "v_fx_rates(date, code, rate_uzs numeric = UZS per 1 unit of code). " +
      "Rows are automatically limited to the current user. Never sum amounts across different currencies without converting. Max 500 rows, 3 s timeout.",
    parametersJsonSchema: {
      type: "object",
      properties: { sql: { type: "string", description: "A single SELECT statement." }, purpose: { type: "string", description: "One line: what this query answers." } },
      required: ["sql"],
    },
  },
];

async function rateTable(ctxDate?: string): Promise<{ rates: RateTable; asOf: string | null }> {
  const r = await getRates(ctxDate ? new Date(`${ctxDate}T00:00:00Z`) : undefined);
  return { rates: r.rates, asOf: r.asOf };
}

async function getBalances(ctx: ToolContext, a: z.infer<typeof schemas.get_balances>): Promise<ToolOutput> {
  const target = a.currency ?? ctx.displayCurrency;
  const [accounts, { rates, asOf }] = await Promise.all([getAccounts(ctx.userId), rateTable()]);
  let total = 0;
  const rows = accounts.map((acc) => {
    const conv = Number(convertMinor(acc.balanceMinor, acc.currency, target, rates));
    total += conv;
    return { name: acc.name, institution: acc.institution, type: acc.subtype ?? acc.type, balance: money(acc.balanceMinor, acc.currency), converted: money(conv, target) };
  });
  return { ok: true, data: { accounts: rows, total: money(total, target), rates_as_of: asOf }, summary: `${rows.length} accounts, total ${formatMoney(total, target)}` };
}

async function searchTransactions(ctx: ToolContext, a: z.infer<typeof schemas.search_transactions>): Promise<ToolOutput> {
  let accountId: string | undefined;
  if (a.account_name) {
    const acc = await prisma.bankAccount.findFirst({ where: { userId: ctx.userId, name: { contains: a.account_name, mode: "insensitive" } } });
    if (!acc) return { ok: false, data: { error: `No account matching "${a.account_name}"` }, summary: "no such account" };
    accountId = acc.id;
  }
  const filter = { q: a.query, category: a.category, accountId, from: a.from, to: a.to, direction: a.direction, currency: a.currency };
  const { items, total } = await listTransactions(ctx.userId, { ...filter, limit: a.limit ?? 20 });
  const sums = await prisma.transaction.groupBy({ by: ["currency"], where: buildTxnWhere(ctx.userId, filter), _sum: { amountMinor: true }, _count: true });
  return {
    ok: true,
    data: {
      total_matches: total,
      sums_by_currency: sums.map((s) => ({ ...money(Number(s._sum.amountMinor ?? 0), s.currency.trim()), count: s._count })),
      shown: items.length,
      transactions: items.map((t) => ({ date: t.bookedAt, merchant: t.merchant, category: t.category, account: t.accountName, amount: toMajor(t.amountMinor, t.currency), currency: t.currency, memo: t.memo })),
    },
    summary: `${total} matches`,
  };
}

async function spendingSummary(ctx: ToolContext, a: z.infer<typeof schemas.spending_summary>): Promise<ToolOutput> {
  const target = a.currency ?? ctx.displayCurrency;
  const { rates, asOf } = await rateTable();
  const where = buildTxnWhere(ctx.userId, { from: a.from, to: a.to, direction: a.direction, category: a.category });
  if (!a.include_transfers && !a.category) where.category = { notIn: NON_SPEND_CATEGORIES };
  const rows = await prisma.transaction.findMany({ where, select: { amountMinor: true, currency: true, category: true, merchant: true, bookedAt: true, account: { select: { name: true } } }, take: 20_000 });
  const groups = new Map<string, { total: number; count: number; byCurrency: Record<string, number> }>();
  let grand = 0;
  for (const r of rows) {
    const c = r.currency.trim();
    const key = a.group_by === "merchant" ? r.merchant : a.group_by === "month" ? iso(r.bookedAt).slice(0, 7) : a.group_by === "account" ? r.account.name : r.category;
    const abs = Math.abs(Number(r.amountMinor));
    const conv = Number(convertMinor(abs, c, target, rates));
    const g = groups.get(key) ?? { total: 0, count: 0, byCurrency: {} };
    g.total += conv;
    g.count++;
    g.byCurrency[c] = (g.byCurrency[c] ?? 0) + abs;
    groups.set(key, g);
    grand += conv;
  }
  const out = [...groups.entries()]
    .sort((x, y) => (a.group_by === "month" ? x[0].localeCompare(y[0]) : y[1].total - x[1].total))
    .slice(0, 40)
    .map(([key, g]) => ({
      [a.group_by]: key,
      total: money(g.total, target),
      count: g.count,
      original: Object.entries(g.byCurrency).map(([c, m]) => money(m, c)),
    }));
  return {
    ok: true,
    data: { from: a.from, to: a.to, direction: a.direction, currency: target, grand_total: money(grand, target), transactions: rows.length, groups: out, rates_as_of: asOf, note: "Converted at the latest CBU rate, not the rate on each transaction date." },
    summary: `${out.length} groups, total ${formatMoney(grand, target)}`,
  };
}

async function convert(_: ToolContext, a: z.infer<typeof schemas.convert>): Promise<ToolOutput> {
  const { rates, asOf } = await rateTable(a.date);
  const minor = convertMinor(toMinor(a.amount, a.from), a.from, a.to, rates);
  return {
    ok: true,
    data: { input: money(Number(toMinor(a.amount, a.from)), a.from), result: money(Number(minor), a.to), rate_uzs: { [a.from]: rates[a.from], [a.to]: rates[a.to] }, rates_as_of: asOf, source: "Central Bank of Uzbekistan" },
    summary: `${a.amount} ${a.from} = ${formatMoney(minor, a.to)}`,
  };
}

const json = (v: unknown) => (typeof v === "bigint" ? Number(v) : v);

async function runSql(ctx: ToolContext, a: z.infer<typeof schemas.run_readonly_sql>): Promise<ToolOutput> {
  const res = await runGuardedQuery(pool, a.sql, {
    userId: ctx.userId,
    policy: SQL_POLICY,
    role: config.sqlRole,
    timeoutMs: 3000,
    maxRows: 500,
    onAudit: async (e) => {
      await prisma.sqlAudit.create({ data: { userId: e.userId, sql: e.sql.slice(0, 4000), status: e.status, reason: e.reason?.slice(0, 500), rowCount: e.rowCount, durationMs: e.durationMs } });
    },
  });
  if (!res.ok) {
    return {
      ok: false,
      blocked: res.status === "blocked",
      sql: a.sql,
      data: { error: res.status === "blocked" ? `Blocked by SQL guard (${res.code}): ${res.reason}` : `Query failed: ${res.reason}` },
      summary: res.status === "blocked" ? `blocked: ${res.code}` : "query error",
    };
  }
  const rows = res.rows.slice(0, 100).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? iso(v) : json(v)])));
  return {
    ok: true,
    sql: a.sql,
    data: { columns: res.columns, rows, row_count: res.rowCount, truncated: res.truncated || res.rowCount > rows.length, ms: res.durationMs },
    summary: `${res.rowCount} rows in ${res.durationMs} ms`,
  };
}

const impl: Record<ToolName, (ctx: ToolContext, args: never) => Promise<ToolOutput>> = {
  get_balances: getBalances,
  search_transactions: searchTransactions,
  spending_summary: spendingSummary,
  convert,
  run_readonly_sql: runSql,
};

export async function callTool(ctx: ToolContext, name: string, rawArgs: unknown): Promise<ToolOutput> {
  if (!(name in schemas)) return { ok: false, data: { error: `Unknown tool ${name}` }, summary: "unknown tool" };
  const parsed = schemas[name as ToolName].safeParse(rawArgs ?? {});
  if (!parsed.success) return { ok: false, data: { error: `Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` }, summary: "invalid arguments" };
  try {
    return await impl[name as ToolName](ctx, parsed.data as never);
  } catch (e) {
    return { ok: false, data: { error: (e as Error).message }, summary: "tool error" };
  }
}
