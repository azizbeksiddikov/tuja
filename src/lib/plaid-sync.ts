import type { AccountBase, PlaidApi, RemovedTransaction, Transaction as PlaidTxn } from "plaid";
import { fromPlaidCategory } from "./categories";
import { toMinor } from "./money";

// Fixes for the tutorial's Plaid code:
//  B1: the sync loop now passes `cursor` and APPENDS every page (it used to refetch page 1 and overwrite),
//      and restarts from the first cursor on TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION.
//  B3: categories come from personal_finance_category (the legacy `category` field is deprecated/empty).
//  B8: every account of an item is imported, not just accounts[0].

export type SyncPage = { added: PlaidTxn[]; modified: PlaidTxn[]; removed: RemovedTransaction[]; accounts: AccountBase[]; nextCursor: string; status?: string };

type SyncClient = Pick<PlaidApi, "transactionsSync">;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function plaidErrorCode(e: unknown): string | undefined {
  return (e as { response?: { data?: { error_code?: string } } })?.response?.data?.error_code;
}

/** Pull all pending updates for an item starting at `cursor`. */
export async function fetchAllUpdates(client: SyncClient, accessToken: string, cursor: string | null, opts: { maxRestarts?: number; waitForInitial?: number; sleepMs?: number } = {}): Promise<SyncPage> {
  const maxRestarts = opts.maxRestarts ?? 3;
  let waits = opts.waitForInitial ?? 0;
  for (let attempt = 0; ; attempt++) {
    const out: SyncPage = { added: [], modified: [], removed: [], accounts: [], nextCursor: cursor ?? "" };
    let next = cursor ?? undefined;
    try {
      for (let page = 0; page < 1000; page++) {
        const { data } = await client.transactionsSync({ access_token: accessToken, cursor: next, count: 500, options: { include_personal_finance_category: true } });
        out.added.push(...data.added);
        out.modified.push(...data.modified);
        out.removed.push(...data.removed);
        if (data.accounts?.length) out.accounts = data.accounts;
        out.status = data.transactions_update_status;
        next = data.next_cursor;
        out.nextCursor = data.next_cursor;
        if (!data.has_more) break;
      }
      // A brand-new item returns NOT_READY with no data for a few seconds; optionally wait for it.
      if (out.status === "NOT_READY" && !out.added.length && waits-- > 0) {
        await sleep(opts.sleepMs ?? 2000);
        attempt--;
        continue;
      }
      return out;
    } catch (e) {
      if (plaidErrorCode(e) === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" && attempt < maxRestarts) continue;
      throw e;
    }
  }
}

/** Plaid amounts are positive for money OUT; we store signed minor units (negative = out). */
export function mapPlaidTransaction(t: PlaidTxn) {
  const currency = (t.iso_currency_code || t.unofficial_currency_code || "USD").toUpperCase();
  return {
    externalId: t.transaction_id,
    plaidAccountId: t.account_id,
    amountMinor: -toMinor(t.amount, currency),
    currency,
    merchant: (t.merchant_name || t.name || "Unknown").slice(0, 200),
    category: fromPlaidCategory(t.personal_finance_category?.primary),
    channel: t.payment_channel || "other",
    bookedAt: new Date(`${t.date}T00:00:00Z`),
    pending: Boolean(t.pending),
  };
}

export function mapPlaidAccount(a: AccountBase) {
  const currency = (a.balances.iso_currency_code || a.balances.unofficial_currency_code || "USD").toUpperCase();
  const bal = a.balances.current ?? a.balances.available ?? 0;
  // Credit/loan balances are amounts owed: show them as negative.
  const signed = a.type === "credit" || a.type === "loan" ? -bal : bal;
  return {
    plaidAccountId: a.account_id,
    name: a.name,
    officialName: a.official_name ?? null,
    mask: a.mask ?? null,
    type: String(a.type),
    subtype: a.subtype ? String(a.subtype) : null,
    currency,
    balanceMinor: toMinor(signed, currency),
  };
}
