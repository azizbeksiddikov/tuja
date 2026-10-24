import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";
import { config } from "./config";

const g = globalThis as unknown as { __prisma?: PrismaClient; __pool?: Pool };

/** Raw pg pool, used by the guarded Text-to-SQL path (pg-guard). */
export const pool: Pool = g.__pool ?? new Pool({ connectionString: config.databaseUrl, max: 5 });

export const prisma: PrismaClient =
  g.__prisma ?? new PrismaClient({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });

if (process.env.NODE_ENV !== "production") {
  g.__prisma = prisma;
  g.__pool = pool;
}
