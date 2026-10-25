import { prisma } from "../src/lib/db";
import { seedDemo } from "../src/lib/demo/seed";
import { fetchCbuRates, fetchLatestRates, storeRates } from "../src/lib/fx";

async function main() {
  const r = await seedDemo(prisma);
  console.log(`seeded demo user (${r.demoTransactions} transactions) + isolation test user`);
  try {
    const latest = await fetchLatestRates();
    const n = await storeRates(latest.rows, latest.source);
    console.log(`stored ${n} ${latest.source} rates for today`);
    let backfill = process.argv.includes("--backfill");
    if (process.argv.includes("--backfill-if-needed")) {
      const dates = await prisma.fxRate.groupBy({ by: ["date"] });
      backfill = dates.length < 10;
    }
    if (backfill && latest.source !== "cbu") {
      console.log("cbu.uz unreachable, skipping the historical backfill (latest rates are used for older dates)");
    } else if (backfill) {
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
    console.warn("FX fetch failed (fallback rates will be used):", (e as Error).message);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
