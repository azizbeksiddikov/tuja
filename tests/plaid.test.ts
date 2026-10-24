import { describe, expect, it, vi } from "vitest";
import type { AccountBase, Transaction } from "plaid";
import { fetchAllUpdates, mapPlaidAccount, mapPlaidTransaction } from "@/lib/plaid-sync";
import { decrypt, encrypt } from "@/lib/crypto";
import { createHash } from "node:crypto";

const txn = (id: string, extra: Partial<Transaction> = {}) =>
  ({ transaction_id: id, account_id: "acc1", amount: 12.5, iso_currency_code: "USD", name: "Uber 063015", merchant_name: "Uber", date: "2026-10-01", pending: false, payment_channel: "online", personal_finance_category: { primary: "TRANSPORTATION", detailed: "TRANSPORTATION_TAXIS_AND_RIDE_SHARES" }, ...extra }) as unknown as Transaction;

function fakeClient(pages: { added: Transaction[]; has_more: boolean; next_cursor: string }[], failOnce?: { atCall: number }) {
  let call = 0;
  const seen: (string | undefined)[] = [];
  const transactionsSync = vi.fn(async (req: { cursor?: string }) => {
    seen.push(req.cursor);
    const n = call++;
    if (failOnce && n === failOnce.atCall) {
      failOnce = undefined;
      throw Object.assign(new Error("mutation"), { response: { data: { error_code: "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" } } });
    }
    const idx = req.cursor ? Number(req.cursor.replace("c", "")) : 0;
    const p = pages[idx];
    return { data: { ...p, modified: [], removed: [], accounts: [], transactions_update_status: "HISTORICAL_UPDATE_COMPLETE" } };
  });
  return { client: { transactionsSync } as never, seen };
}

describe("Plaid transactions sync (fixes tutorial bug B1)", () => {
  it("passes the cursor and appends every page", async () => {
    const { client, seen } = fakeClient([
      { added: [txn("t1"), txn("t2")], has_more: true, next_cursor: "c1" },
      { added: [txn("t3")], has_more: true, next_cursor: "c2" },
      { added: [txn("t4")], has_more: false, next_cursor: "c3" },
    ]);
    const r = await fetchAllUpdates(client, "tok", null);
    expect(seen).toEqual([undefined, "c1", "c2"]);
    expect(r.added.map((t) => t.transaction_id)).toEqual(["t1", "t2", "t3", "t4"]);
    expect(r.nextCursor).toBe("c3");
  });

  it("restarts from the first cursor on TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION", async () => {
    const { client, seen } = fakeClient(
      [
        { added: [txn("t1")], has_more: true, next_cursor: "c1" },
        { added: [txn("t2")], has_more: false, next_cursor: "c2" },
      ],
      { atCall: 1 },
    );
    const r = await fetchAllUpdates(client, "tok", null);
    expect(seen).toEqual([undefined, "c1", undefined, "c1"]);
    expect(r.added.map((t) => t.transaction_id)).toEqual(["t1", "t2"]); // no duplicates from the failed attempt
  });

  it("maps amount sign, minor units and personal_finance_category (B3)", () => {
    const m = mapPlaidTransaction(txn("t1"));
    expect(m.amountMinor).toBe(-1250n); // Plaid positive = money out
    expect(m.category).toBe("Transport");
    expect(m.merchant).toBe("Uber");
    const refund = mapPlaidTransaction(txn("t2", { amount: -500, personal_finance_category: { primary: "INCOME" } as never }));
    expect(refund.amountMinor).toBe(50000n);
    expect(refund.category).toBe("Income");
  });

  it("shows credit balances as owed", () => {
    const a = mapPlaidAccount({ account_id: "a", name: "Plaid Credit Card", type: "credit", subtype: "credit card", mask: "3333", balances: { current: 410, available: null, iso_currency_code: "USD" } } as unknown as AccountBase);
    expect(a.balanceMinor).toBe(-41000n);
  });
});

describe("AES-256-GCM token encryption (B6)", () => {
  const key = createHash("sha256").update("test").digest();
  it("round-trips and never contains the plaintext", () => {
    const enc = encrypt("access-sandbox-123", key);
    expect(enc).not.toContain("access-sandbox");
    expect(decrypt(enc, key)).toBe("access-sandbox-123");
    expect(encrypt("x", key)).not.toBe(encrypt("x", key)); // random IV
  });
  it("rejects tampering and wrong keys", () => {
    const enc = encrypt("secret", key);
    const parts = enc.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decrypt(parts.join("."), key)).toThrow();
    expect(() => decrypt(enc, createHash("sha256").update("other").digest())).toThrow();
  });
});
