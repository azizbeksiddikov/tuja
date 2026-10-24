import { prisma } from "../src/lib/db";
import { fetchCbuRates, storeRates } from "../src/lib/fx";

const date = process.argv[2]; // optional YYYY-MM-DD
storeRates(await fetchCbuRates(date))
  .then((n) => console.log(`stored ${n} rates${date ? ` for ${date}` : ""}`))
  .finally(() => prisma.$disconnect());
