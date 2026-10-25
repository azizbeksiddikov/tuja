// Daily demo freshness against the dev Postgres (docker compose up -d && npm run db:seed). Skipped if unreachable.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { demoSeededDay, ensureDemoFresh, resetDemoFreshnessCache } from "@/lib/demo/refresh";
import { DEMO_EMAIL } from "@/lib/demo/seed";
import { generateDemoTransactions } from "@/lib/demo/generate";

let up = false;
let demoId = "";
const today = new Date().toISOString().slice(0, 10);

async function ageDemo(days: number) {
  await prisma.$executeRaw`UPDATE bank_accounts SET created_at = now() - make_interval(days => ${days}::int) WHERE user_id = ${demoId}`;
  await prisma.$executeRaw`UPDATE transactions SET booked_at = booked_at - make_interval(days => ${days}::int) WHERE user_id = ${demoId}`;
}

beforeAll(async () => {
  try {
    demoId = (await prisma.user.findUnique({ where: { email: DEMO_EMAIL } }))?.id ?? "";
    up = Boolean(demoId);
  } catch {
    up = false;
  }
});
afterAll(() => prisma.$disconnect());

describe("demo freshness", () => {
  it("reseeds stale demo data so it ends today, then is a no-op", async ({ skip }) => {
    if (!up) skip();
    resetDemoFreshnessCache();
    await ageDemo(3);
    expect(await demoSeededDay(prisma)).not.toBe(today);

    expect(await ensureDemoFresh(prisma)).toBe(true);
    expect(await demoSeededDay(prisma)).toBe(today);
    const last = await prisma.transaction.findFirst({ where: { userId: demoId }, orderBy: { bookedAt: "desc" } });
    const lastDay = last!.bookedAt.toISOString().slice(0, 10);
    expect(lastDay <= today).toBe(true);
    expect(Date.parse(today) - Date.parse(lastDay)).toBeLessThanOrEqual(2 * 86_400_000);

    expect(await ensureDemoFresh(prisma)).toBe(false); // in-process cache
    resetDemoFreshnessCache();
    expect(await ensureDemoFresh(prisma)).toBe(false); // DB says fresh
  });

  it("concurrent refreshes reseed exactly once, without duplicates", async ({ skip }) => {
    if (!up) skip();
    await ageDemo(2);
    resetDemoFreshnessCache();
    const a = ensureDemoFresh(prisma);
    resetDemoFreshnessCache(); // simulate a second process: bypass the in-process de-duplication
    const b = ensureDemoFresh(prisma);
    const c = ensureDemoFresh(prisma); // same "process" as b: shares b's in-flight promise
    const results = await Promise.all([a, b, c]);
    expect(results.filter(Boolean).length).toBeGreaterThanOrEqual(1);
    expect([results[0], results[1]].filter(Boolean)).toHaveLength(1);

    const accounts = await prisma.bankAccount.count({ where: { userId: demoId } });
    const txns = await prisma.transaction.count({ where: { userId: demoId } });
    expect(accounts).toBe(3);
    expect(txns).toBe(generateDemoTransactions(new Date()).length);
    expect(await demoSeededDay(prisma)).toBe(today);
  });
});
