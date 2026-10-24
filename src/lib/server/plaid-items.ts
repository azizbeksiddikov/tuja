import { CountryCode, Products } from "plaid";
import { prisma } from "@/lib/db";
import { getPlaid } from "@/lib/plaid";
import { decrypt, encrypt } from "@/lib/crypto";
import { fetchAllUpdates, mapPlaidAccount, mapPlaidTransaction } from "@/lib/plaid-sync";
import { config } from "@/lib/config";

export async function createLinkToken(userId: string) {
  const { data } = await getPlaid().linkTokenCreate({
    user: { client_user_id: userId },
    client_name: config.appName,
    products: [Products.Transactions], // B2: request Transactions consent (tutorial asked only for Auth)
    transactions: { days_requested: 180 },
    country_codes: [CountryCode.Us],
    language: "en",
  });
  return data.link_token;
}

export async function exchangeAndStore(userId: string, publicToken: string) {
  const plaid = getPlaid();
  const { data } = await plaid.itemPublicTokenExchange({ public_token: publicToken });
  let institutionName: string | null = null;
  let institutionId: string | null = null;
  try {
    const item = await plaid.itemGet({ access_token: data.access_token });
    institutionId = item.data.item.institution_id ?? null;
    if (institutionId) {
      const inst = await plaid.institutionsGetById({ institution_id: institutionId, country_codes: [CountryCode.Us] });
      institutionName = inst.data.institution.name;
    }
  } catch {
    /* institution name is cosmetic */
  }
  const item = await prisma.plaidItem.upsert({
    where: { itemId: data.item_id },
    create: { userId, itemId: data.item_id, accessTokenEnc: encrypt(data.access_token), institutionId, institutionName },
    update: { accessTokenEnc: encrypt(data.access_token), institutionId, institutionName },
  });
  if (item.userId !== userId) throw new Error("Item belongs to another user");
  return syncItem(userId, item.id, { waitForInitial: 8 });
}

/** Sync balances and transactions for one of the user's items (ownership checked). */
export async function syncItem(userId: string, plaidItemId: string, opts: { waitForInitial?: number } = {}) {
  const item = await prisma.plaidItem.findFirst({ where: { id: plaidItemId, userId } });
  if (!item) throw new Error("Not found");
  const plaid = getPlaid();
  const accessToken = decrypt(item.accessTokenEnc);

  const accRes = await plaid.accountsGet({ access_token: accessToken });
  const accountIds = new Map<string, string>();
  for (const a of accRes.data.accounts) {
    const m = mapPlaidAccount(a);
    const row = await prisma.bankAccount.upsert({
      where: { plaidAccountId: m.plaidAccountId },
      create: { ...m, userId, institution: item.institutionName ?? "Plaid sandbox", source: "plaid", plaidItemId: item.id },
      update: { name: m.name, officialName: m.officialName, mask: m.mask, balanceMinor: m.balanceMinor, currency: m.currency },
    });
    if (row.userId !== userId) throw new Error("Account belongs to another user");
    accountIds.set(m.plaidAccountId, row.id);
  }

  const upd = await fetchAllUpdates(plaid, accessToken, item.cursor, { waitForInitial: opts.waitForInitial ?? 0 });
  let added = 0;
  await prisma.$transaction(async (tx) => {
    for (const t of [...upd.added, ...upd.modified]) {
      const m = mapPlaidTransaction(t);
      const accountId = accountIds.get(m.plaidAccountId);
      if (!accountId) continue;
      const { plaidAccountId: _, ...data } = m;
      await tx.transaction.upsert({ where: { externalId: m.externalId }, create: { ...data, userId, accountId }, update: { ...data, accountId } });
      added++;
    }
    const removed = upd.removed.map((r) => r.transaction_id).filter(Boolean);
    if (removed.length) await tx.transaction.deleteMany({ where: { userId, externalId: { in: removed } } });
    await tx.plaidItem.update({ where: { id: item.id }, data: { cursor: upd.nextCursor } });
  }, { timeout: 60_000 });
  return { accounts: accountIds.size, upserted: added, removed: upd.removed.length, status: upd.status };
}
