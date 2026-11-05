import { defineConfig } from "prisma/config";

// Local dev default matches docker-compose.yml (dev-only credentials, not a secret).
const url = process.env.DATABASE_URL ?? "postgresql://bank:bank@localhost:4221/bank";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx scripts/seed.ts" },
  datasource: { url },
});
