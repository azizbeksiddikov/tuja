import type { PrismaClient } from "@/generated/prisma/client";
import { DEMO_EMAIL, seedDemoTx } from "./seed";

// Keeps the public demo looking current: the persona's data is regenerated so that it always ends
// "today" (UTC). Checked on demo requests, at most one DB check per process per day once fresh.
//  - idempotent: reseeds only when the demo accounts were created before today (UTC)
//  - concurrency-safe: a transaction-scoped Postgres advisory lock lets exactly one request (across
//    all processes) reseed; the others skip and keep serving the previous data, which stays visible
//    until the reseed commits because it runs in one transaction.
//  - never throws: a failure is logged and retried after a short pause.

const LOCK_KEY = 2026_10_24; // arbitrary app-wide advisory lock id for the demo reseed
const RETRY_AFTER_MS = 5 * 60_000;

const state = { freshDay: "", failedAt: 0, inflight: null as Promise<boolean> | null };

const utcDay = (d: Date) => d.toISOString().slice(0, 10);

/** UTC day (YYYY-MM-DD) the demo persona was last seeded, or null if it does not exist yet. */
export async function demoSeededDay(db: Pick<PrismaClient, "$queryRaw">): Promise<string | null> {
  const rows = await db.$queryRaw<{ seeded: Date | null }[]>`
    SELECT min(b.created_at) AS seeded
    FROM bank_accounts b JOIN users u ON u.id = b.user_id
    WHERE u.email = ${DEMO_EMAIL} AND b.source = 'demo'`;
  return rows[0]?.seeded ? utcDay(rows[0].seeded) : null;
}

async function refresh(prisma: PrismaClient, now: Date): Promise<boolean> {
  const today = utcDay(now);
  const seeded = await demoSeededDay(prisma);
  if (seeded && seeded >= today) {
    state.freshDay = today;
    return false;
  }
  const did = await prisma.$transaction(
    async (tx) => {
      const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${LOCK_KEY}) AS locked`;
      if (!locked) return false; // someone else is reseeding right now
      const again = await demoSeededDay(tx);
      if (again && again >= today) return false; // reseeded while we waited
      await seedDemoTx(tx, now);
      return true;
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
  if (did) {
    state.freshDay = today;
    console.log(`[demo] reseeded demo persona for ${today}`);
  }
  return did;
}

/** Reseed the demo persona if its data is from an earlier day. Returns true if this call reseeded. */
export async function ensureDemoFresh(prisma: PrismaClient, now = new Date()): Promise<boolean> {
  if (state.freshDay === utcDay(now)) return false;
  if (Date.now() - state.failedAt < RETRY_AFTER_MS) return false;
  state.inflight ??= refresh(prisma, now)
    .catch((e) => {
      state.failedAt = Date.now();
      console.error("[demo] reseed failed:", (e as Error).message);
      return false;
    })
    .finally(() => {
      state.inflight = null;
    });
  return state.inflight;
}

/** Test helper: forget the per-process cache. */
export function resetDemoFreshnessCache() {
  state.freshDay = "";
  state.failedAt = 0;
  state.inflight = null;
}
