// Headless end-to-end check of the Plaid integration against the Plaid SANDBOX (no Link UI):
// sandbox public token -> exchange -> encrypted storage -> accounts + transactionsSync -> DB.
// Uses a temporary local user that is deleted afterwards.  npx tsx scripts/plaid-sandbox-check.ts
import "./load-env";
import { randomUUID } from "node:crypto";

async function main() {
  const { prisma } = await import("../src/lib/db");
  const { getPlaid } = await import("../src/lib/plaid");
  const { exchangeAndStore } = await import("../src/lib/server/plaid-items");
  const { Products } = await import("plaid");
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `plaid-check-${id.slice(0, 8)}@tuja.local`, name: "Plaid check" } });
  try {
    const { createLinkToken } = await import("../src/lib/server/plaid-items");
    const link = await createLinkToken(id);
    console.log("link token (transactions product):", link.startsWith("link-sandbox-") ? "ok" : "unexpected");
    const t0 = Date.now();
    const { data } = await getPlaid().sandboxPublicTokenCreate({ institution_id: "ins_109508", initial_products: [Products.Transactions], options: { override_username: "user_good", override_password: "pass_good" } });
    const r = await exchangeAndStore(id, data.public_token);
    const accounts = await prisma.bankAccount.findMany({ where: { userId: id } });
    const cats = await prisma.transaction.groupBy({ by: ["category"], where: { userId: id }, _count: true });
    const item = await prisma.plaidItem.findFirstOrThrow({ where: { userId: id } });
    console.log(JSON.stringify({ ...r, seconds: (Date.now() - t0) / 1000, accountsInDb: accounts.length, accountTypes: accounts.map((a) => `${a.type}/${a.subtype}`), categories: Object.fromEntries(cats.map((c) => [c.category, c._count])), tokenEncrypted: item.accessTokenEnc.startsWith("v1.") && !item.accessTokenEnc.includes("access-"), cursorSaved: Boolean(item.cursor) }, null, 1));
  } finally {
    await prisma.user.delete({ where: { id } });
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error("FAILED:", e?.response?.data?.error_code ?? e?.message);
  process.exit(1);
});
