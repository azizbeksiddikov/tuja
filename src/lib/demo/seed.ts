import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  DEMO_ACCOUNTS,
  OTHER_USER_ACCOUNTS,
  generateDemoTransactions,
  generateOtherUserTransactions,
  type DemoAccount,
  type DemoTxn,
} from "./generate";

export const DEMO_EMAIL = "demo@tuja.local";
export const DEMO_PASSWORD = "demo-account-not-secret"; // public on purpose (read-only persona)
export const OTHER_EMAIL = "other-user@tuja.local";

async function upsertUser(prisma: PrismaClient, email: string, name: string, password: string, isDemo: boolean) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const id = randomUUID();
  const user = await prisma.user.create({ data: { id, email, name, emailVerified: true, isDemo, homeCurrency: "KRW" } });
  await prisma.account.create({
    data: { id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: await hashPassword(password) },
  });
  return user;
}

async function writeAccounts(prisma: PrismaClient, userId: string, accounts: DemoAccount[], txns: DemoTxn[]) {
  await prisma.transaction.deleteMany({ where: { userId } });
  await prisma.transfer.deleteMany({ where: { userId } });
  await prisma.bankAccount.deleteMany({ where: { userId } });
  for (const a of accounts) {
    const own = txns.filter((t) => t.accountKey === a.key);
    const balance = own.reduce((s, t) => s + t.amountMinor, a.openingMinor);
    const acc = await prisma.bankAccount.create({
      data: {
        userId, name: a.name, officialName: a.officialName, institution: a.institution, mask: a.mask,
        type: a.type, subtype: a.subtype, currency: a.currency, balanceMinor: balance, source: "demo",
      },
    });
    await prisma.transaction.createMany({
      data: own.map((t) => ({
        userId, accountId: acc.id, amountMinor: t.amountMinor, currency: t.currency, merchant: t.merchant,
        category: t.category, channel: t.channel, bookedAt: new Date(`${t.bookedAt}T00:00:00Z`), memo: t.memo ?? null,
      })),
    });
  }
}

/** (Re)create the demo persona and a second user (for cross-user isolation tests). Idempotent. */
export async function seedDemo(prisma: PrismaClient, endDate = new Date()) {
  const demo = await upsertUser(prisma, DEMO_EMAIL, "Dilnoza (demo)", DEMO_PASSWORD, true);
  await prisma.user.update({ where: { id: demo.id }, data: { homeCurrency: "KRW" } });
  const txns = generateDemoTransactions(endDate);
  await writeAccounts(prisma, demo.id, DEMO_ACCOUNTS, txns);

  const other = await upsertUser(prisma, OTHER_EMAIL, "Other User", randomUUID(), false);
  await writeAccounts(prisma, other.id, OTHER_USER_ACCOUNTS, generateOtherUserTransactions(endDate));

  return { demoUserId: demo.id, otherUserId: other.id, demoTransactions: txns.length };
}
