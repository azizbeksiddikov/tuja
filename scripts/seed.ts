import { prisma } from "../src/lib/db";
import { seedDemo } from "../src/lib/demo/seed";
import { fetchCbuRates, storeRates } from "../src/lib/fx";

async function main() {
  const r = await seedDemo(prisma);
  console.log(`seeded demo user (${r.demoTransactions} transactions) + isolation test user`);
  try {
    const n = await storeRates(await fetchCbuRates());
    console.log(`stored ${n} CBU rates for today`);
    if (process.argv.includes("--backfill")) {
      for (let i = 7; i <= 183; i += 7) {
        const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
        try {
          await storeRates(await fetchCbuRates(d));
        } catch (e) {
          console.warn(`  skip ${d}: ${(e as Error).message}`);
        }
      }
      console.log("backfilled weekly CBU rates for ~6 months");
    }
  } catch (e) {
    console.warn("CBU fetch failed (fallback rates will be used):", (e as Error).message);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
