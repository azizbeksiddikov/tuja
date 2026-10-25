import Link from "next/link";
import Money from "@/components/Money";
import TxnRow from "@/components/TxnRow";
import { categoryEmoji } from "@/lib/categories";
import { requireUser } from "@/lib/auth";
import { cashflow, getAccounts, listTransactions, loadRates, monthRange, spendingByCategory, sumIn } from "@/lib/server/finance";
import { getDisplayCurrency } from "@/lib/server/prefs";

export const metadata = { title: "Home" };

const FLAG: Record<string, string> = { KRW: "🇰🇷", UZS: "🇺🇿", USD: "🇺🇸", EUR: "🇪🇺", RUB: "🇷🇺" };

export default async function Dashboard() {
  const user = await requireUser();
  const ccy = await getDisplayCurrency(user.homeCurrency);
  const [{ rates, asOf, source }, accounts] = await Promise.all([loadRates(), getAccounts(user.id)]);
  const month = monthRange(0);
  const prev = monthRange(-1);
  const [recent, cats, flow, prevFlow] = await Promise.all([
    listTransactions(user.id, { limit: 8 }),
    spendingByCategory(user.id, month.from, month.to, ccy, rates),
    cashflow(user.id, month.from, month.to, ccy, rates),
    cashflow(user.id, prev.from, prev.to, ccy, rates),
  ]);
  const total = sumIn(accounts.map((a) => ({ amountMinor: a.balanceMinor, currency: a.currency })), ccy, rates);
  const maxCat = Math.max(1, ...cats.map((c) => c.amountMinor));
  const delta = prevFlow.spendMinor ? Math.round(((flow.spendMinor - prevFlow.spendMinor) / prevFlow.spendMinor) * 100) : null;

  if (!accounts.length) {
    return (
      <div className="card text-center">
        <p className="text-4xl">🏦</p>
        <h1 className="mt-3 text-xl font-extrabold">No accounts yet</h1>
        <p className="mt-2 text-sm text-muted">Link a Plaid sandbox bank from the More tab, or try the demo account to explore.</p>
        <Link href="/more" className="btn-primary mt-4">Link a bank</Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <section className="card md:col-span-2">
        <p className="text-sm text-muted">Total balance · {accounts.length} accounts</p>
        <p className="mt-1 text-[34px] font-extrabold leading-tight md:text-5xl">
          <Money minor={total} ccy={ccy} />
        </p>
        <p className="mt-1 text-xs text-muted">
          Converted at{" "}
          {source === "cbu" ? (
            `CBU rates of ${asOf}`
          ) : source === "er-api" ? (
            <>
              open.er-api.com rates of {asOf} (cbu.uz unreachable),{" "}
              <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer" className="underline">Rates By Exchange Rate API</a>
            </>
          ) : (
            "built-in fallback rates (live rate sources unreachable)"
          )}{" "}
          · <span className="whitespace-nowrap">1 USD = {Math.round(rates.USD).toLocaleString("en-US")} UZS</span> · <span className="whitespace-nowrap">1 KRW = {rates.KRW?.toFixed(2)} UZS</span>
        </p>
        <div className="mt-4 flex gap-2">
          <Link href="/assistant" className="btn-primary flex-1">Ask AI</Link>
          <Link href="/transactions" className="btn-soft flex-1">Transactions</Link>
        </div>
      </section>

      <section className="card">
        <h2 className="mb-1 font-extrabold">Accounts</h2>
        <ul className="divide-y divide-line">
          {accounts.map((a) => (
            <li key={a.id}>
              <Link href={`/transactions?account=${a.id}`} className="flex items-center gap-3 py-3">
                <div className="icon-tile">{FLAG[a.currency] ?? "🏦"}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{a.name}</p>
                  <p className="truncate text-xs text-muted">{a.institution}{a.mask ? ` ·· ${a.mask}` : ""}</p>
                </div>
                <div className="text-right">
                  <Money minor={a.balanceMinor} ccy={a.currency} className="block text-sm font-bold" />
                  {a.currency !== ccy && <Money minor={sumIn([{ amountMinor: a.balanceMinor, currency: a.currency }], ccy, rates)} ccy={ccy} className="block text-xs text-muted" />}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <div className="flex items-baseline justify-between">
          <h2 className="font-extrabold">{month.label}</h2>
          {delta !== null && <span className="text-xs text-muted">{delta > 0 ? "+" : ""}{delta}% spend vs {prev.label.split(" ")[0]}</span>}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-tile bg-soft p-3">
            <p className="text-xs text-muted">Spent</p>
            <Money minor={flow.spendMinor} ccy={ccy} className="text-lg font-extrabold" />
          </div>
          <div className="rounded-tile bg-soft p-3">
            <p className="text-xs text-muted">Came in</p>
            <Money minor={flow.incomeMinor} ccy={ccy} className="text-lg font-extrabold text-pos" />
          </div>
        </div>
        <ul className="mt-2 space-y-0.5">
          {cats.slice(0, 6).map((c) => (
            <li key={c.category}>
              <Link href={`/transactions?category=${encodeURIComponent(c.category)}&from=${month.from}&to=${month.to}`} className="flex min-h-10 items-center gap-3">
                <span className="w-6 text-center" aria-hidden>{categoryEmoji(c.category)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2 text-xs">
                    <span className="truncate font-bold">{c.category}</span>
                    <Money minor={c.amountMinor} ccy={ccy} className="text-muted" />
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-soft">
                    <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.max(3, (c.amountMinor / maxCat) * 100)}%` }} />
                  </div>
                </div>
              </Link>
            </li>
          ))}
          {!cats.length && <li className="text-sm text-muted">No spending yet this month.</li>}
        </ul>
      </section>

      <section className="card">
        <div className="flex items-baseline justify-between">
          <h2 className="font-extrabold">Recent</h2>
          <Link href="/transactions" className="-my-2 inline-flex min-h-10 items-center px-1 text-xs font-bold text-muted">See all →</Link>
        </div>
        <ul className="divide-y divide-line">
          {recent.items.map((t) => <TxnRow key={t.id} t={t} />)}
        </ul>
      </section>

      <Link href={`/assistant?q=${encodeURIComponent("Where did most of my won go this month, and how does it compare to last month?")}`} className="block rounded-card bg-dark p-5 text-card">
        <p className="text-xs text-card/60">Ask AI ✨</p>
        <p className="mt-1 text-lg font-bold leading-snug">
          “Where did most of my <span className="text-accent">won</span> go this month, and how does it compare to last month?”
        </p>
        <p className="mt-3 text-xs text-card/60">Gemini with function calling and read-only SQL. Every query is shown.</p>
      </Link>
    </div>
  );
}
