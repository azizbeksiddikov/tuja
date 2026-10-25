import Link from "next/link";
import Money from "@/components/Money";
import TxnRow from "@/components/TxnRow";
import { requireUser } from "@/lib/auth";
import { getAccounts, getCategories, listTransactions, loadRates, sumIn, type TxnFilter } from "@/lib/server/finance";
import { getDisplayCurrency } from "@/lib/server/prefs";

export const metadata = { title: "Transactions" };
const PAGE = 30;

type SP = { q?: string; account?: string; category?: string; direction?: string; from?: string; to?: string; page?: string };

export default async function Transactions({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const ccy = await getDisplayCurrency(user.homeCurrency);
  const [accounts, categories, { rates }] = await Promise.all([getAccounts(user.id), getCategories(user.id), loadRates()]);

  // Ownership: an account id from the URL is used only if it is one of this user's accounts.
  const account = accounts.find((a) => a.id === sp.account);
  const page = Math.max(1, Number(sp.page) || 1);
  const filter: TxnFilter = {
    q: sp.q?.slice(0, 80) || undefined,
    accountId: account?.id,
    category: categories.includes(sp.category ?? "") ? sp.category : undefined,
    direction: sp.direction === "in" || sp.direction === "out" ? sp.direction : undefined,
    from: sp.from,
    to: sp.to,
    limit: PAGE,
    offset: (page - 1) * PAGE,
  };
  const { items, total } = await listTransactions(user.id, filter);
  const all = await listTransactions(user.id, { ...filter, limit: 500, offset: 0 });
  const net = sumIn(all.items, ccy, rates);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (p: number) => {
    const u = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page") as [string, string][]);
    u.set("page", String(p));
    return `?${u}`;
  };

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[280px_minmax(0,1fr)]">
      <form className="card flex h-fit flex-col gap-2.5 text-sm" method="get">
        <h1 className="text-lg font-extrabold">Spend</h1>
        <input name="q" defaultValue={sp.q} placeholder="Search merchant or memo" className="field" />
        <details className="group" open={Boolean(account || filter.category || filter.direction || sp.from || sp.to)}>
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between rounded-tile px-1 text-xs font-bold text-muted">
            More filters <span className="transition group-open:rotate-90" aria-hidden>›</span>
          </summary>
          <div className="mt-1 flex flex-col gap-2.5">
            <select name="account" defaultValue={account?.id ?? ""} className="field">
              <option value="">All accounts</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
            </select>
            <select name="category" defaultValue={filter.category ?? ""} className="field">
              <option value="">All categories</option>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select name="direction" defaultValue={filter.direction ?? ""} className="field">
              <option value="">In and out</option>
              <option value="out">Money out</option>
              <option value="in">Money in</option>
            </select>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-muted">From<input type="date" name="from" defaultValue={sp.from} className="field mt-1 px-2" /></label>
              <label className="text-xs text-muted">To<input type="date" name="to" defaultValue={sp.to} className="field mt-1 px-2" /></label>
            </div>
          </div>
        </details>
        <div className="flex gap-2">
          <button className="btn-primary flex-1">Apply</button>
          <Link href="/transactions" className="btn-soft">Reset</Link>
        </div>
      </form>

      <section className="card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm text-muted">{total} transactions</p>
          <p className="text-sm">
            Net <Money minor={net} ccy={ccy} signed colored className="font-extrabold" />
            {total > 500 && <span className="text-xs text-muted"> (first 500)</span>}
          </p>
        </div>
        <ul className="mt-2 divide-y divide-line">
          {items.map((t) => <TxnRow key={t.id} t={t} showAccount />)}
          {!items.length && <li className="py-10 text-center text-sm text-muted">Nothing matches these filters.</li>}
        </ul>
        {pages > 1 && (
          <div className="mt-3 flex items-center justify-between text-sm">
            {page > 1 ? <Link className="btn-soft" href={qs(page - 1)}>← Newer</Link> : <span />}
            <span className="text-muted">Page {page} / {pages}</span>
            {page < pages ? <Link className="btn-soft" href={qs(page + 1)}>Older →</Link> : <span />}
          </div>
        )}
      </section>
    </div>
  );
}
