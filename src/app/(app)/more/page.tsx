import Money from "@/components/Money";
import PlaidConnect from "@/components/PlaidConnect";
import { signOutAction } from "@/app/actions/auth";
import { syncAllAction } from "@/app/actions/plaid";
import { requireUser } from "@/lib/auth";
import { isPlaidConfigured } from "@/lib/config";
import { getAccounts } from "@/lib/server/finance";

export const metadata = { title: "More" };

export default async function More() {
  const user = await requireUser();
  const accounts = await getAccounts(user.id);
  const plaid = isPlaidConfigured() && !user.isDemo;
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <section className="card">
        <p className="text-xs text-muted">Signed in as</p>
        <p className="font-extrabold">{user.name}</p>
        <p className="text-sm text-muted">{user.isDemo ? "Shared demo account (read-only)" : user.email}</p>
        <form action={signOutAction} className="mt-4">
          <button className="btn-soft w-full">Sign out</button>
        </form>
      </section>

      <section className="card">
        <h2 className="font-extrabold">Bank connections</h2>
        {plaid ? (
          <>
            <p className="mt-1 text-sm text-muted">Plaid sandbox: pick any test bank and log in with <code className="rounded bg-soft px-1">user_good</code> / <code className="rounded bg-soft px-1">pass_good</code>.</p>
            <div className="mt-3"><PlaidConnect /></div>
            {accounts.some((a) => a.source === "plaid") && (
              <form action={syncAllAction} className="mt-2"><button className="btn-soft w-full">Sync transactions</button></form>
            )}
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">
            {user.isDemo ? "Linking banks is turned off in the read-only demo. Create your own account to try the Plaid sandbox." : "Bank linking is not configured on this server."}
          </p>
        )}
        <ul className="mt-3 divide-y divide-line">
          {accounts.map((a) => (
            <li key={a.id} className="flex justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 truncate"><b>{a.name}</b> <span className="text-muted">· {a.source}</span></span>
              <Money minor={a.balanceMinor} ccy={a.currency} />
            </li>
          ))}
        </ul>
      </section>

      <section className="card md:col-span-2">
        <h2 className="font-extrabold">How the AI stays inside your data</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>The assistant calls typed tools that always filter by your user id on the server.</li>
          <li>Free-form SQL is parsed with the real Postgres parser: one SELECT, allowlisted views and functions only.</li>
          <li>It runs in a READ ONLY transaction as a role with no table access except those views, with a 3 s timeout and a 500-row cap.</li>
          <li>Row-level security limits every row to your user id, even if every check above failed.</li>
          <li>Every query, blocked or not, is written to an audit log. The assistant never executes writes.</li>
        </ol>
      </section>
    </div>
  );
}
