// Integration tests for the guarded SQL path against a real Postgres (docker compose up -d && npm run db:seed).
// Skipped automatically when the database is unreachable.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { runGuardedQuery, type GuardPolicy } from "@/lib/pg-guard";

const url = process.env.DATABASE_URL || "postgresql://bank:bank@localhost:4221/bank";
const pool = new Pool({ connectionString: url, max: 3 });
const policy: GuardPolicy = { allowedRelations: ["v_transactions", "v_accounts", "v_fx_rates"] };

let up = false;
let demoId = "";
let otherId = "";

beforeAll(async () => {
  try {
    const r = await pool.query<{ id: string; email: string }>(
      "SELECT id, email FROM users WHERE email IN ('demo@tuja.local', 'other-user@tuja.local')",
    );
    demoId = r.rows.find((x) => x.email.startsWith("demo"))?.id ?? "";
    otherId = r.rows.find((x) => x.email.startsWith("other"))?.id ?? "";
    up = Boolean(demoId && otherId);
  } catch {
    up = false;
  }
});
afterAll(() => pool.end());

/** Run raw SQL as the read-only role, bypassing the AST validator (to prove RLS alone holds). */
async function rawAsRole(userId: string, sql: string) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN READ ONLY");
    await c.query("SET LOCAL ROLE app_ro_sql");
    await c.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    return await c.query(sql);
  } finally {
    await c.query("ROLLBACK").catch(() => {});
    c.release();
  }
}

describe.runIf(process.env.SKIP_DB_TESTS !== "1")("pg-guard on Postgres", () => {
  it("returns only the caller's rows", async () => {
    if (!up) return;
    const res = await runGuardedQuery(pool, "SELECT count(*)::int AS n FROM v_transactions", { userId: demoId, policy, role: "app_ro_sql" });
    expect(res.ok).toBe(true);
    const own = await pool.query("SELECT count(*)::int AS n FROM transactions WHERE user_id = $1", [demoId]);
    if (res.ok) expect(res.rows[0].n).toBe(own.rows[0].n);
  });

  it("never leaks the other user's merchant even with an always-true filter", async () => {
    if (!up) return;
    const res = await runGuardedQuery(pool, "SELECT merchant FROM v_transactions WHERE true OR 1=1", { userId: demoId, policy, role: "app_ro_sql", maxRows: 5000 });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.rows.some((r) => String(r.merchant).includes("SECRET-OTHER-USER"))).toBe(false);
  });

  it("RLS holds even if the validator is bypassed (base table)", async () => {
    if (!up) return;
    const r = await rawAsRole(demoId, "SELECT DISTINCT user_id FROM transactions");
    expect(r.rows.map((x) => x.user_id)).toEqual([demoId]);
  });

  it("column grants hide secrets even if the validator is bypassed", async () => {
    if (!up) return;
    await expect(rawAsRole(demoId, "SELECT access_token_enc FROM plaid_items")).rejects.toThrow(/permission denied/);
    await expect(rawAsRole(demoId, "SELECT * FROM users")).rejects.toThrow(/permission denied/);
    await expect(rawAsRole(demoId, "SELECT * FROM sessions")).rejects.toThrow(/permission denied/);
  });

  it("no user id set means no rows", async () => {
    if (!up) return;
    const r = await rawAsRole("", "SELECT count(*)::int AS n FROM transactions");
    expect(r.rows[0].n).toBe(0);
  });

  it("writes fail inside the read-only transaction even if the validator is bypassed", async () => {
    if (!up) return;
    await expect(rawAsRole(demoId, "DELETE FROM transactions")).rejects.toThrow(/read-only|permission denied/);
  });

  it("enforces statement_timeout", async () => {
    if (!up) return;
    const res = await runGuardedQuery(
      pool,
      "SELECT count(*) FROM v_transactions a, v_transactions b, v_transactions c, v_transactions d",
      { userId: demoId, policy, role: "app_ro_sql", timeoutMs: 300 },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/statement timeout|canceling statement/);
  });

  it("caps rows and reports truncation", async () => {
    if (!up) return;
    const res = await runGuardedQuery(pool, "SELECT * FROM v_transactions", { userId: demoId, policy, role: "app_ro_sql", maxRows: 5 });
    expect(res.ok && res.rowCount === 5 && res.truncated).toBe(true);
  });

  it("audits blocked attempts", async () => {
    if (!up) return;
    const events: string[] = [];
    const res = await runGuardedQuery(pool, "DROP TABLE transactions", {
      userId: demoId, policy, role: "app_ro_sql", onAudit: (e) => { events.push(e.status); },
    });
    expect(res.ok).toBe(false);
    expect(events).toEqual(["blocked"]);
  });

  it("other user sees only their own data", async () => {
    if (!up) return;
    const res = await runGuardedQuery(pool, "SELECT DISTINCT merchant FROM v_transactions", { userId: otherId, policy, role: "app_ro_sql" });
    expect(res.ok && res.rows.every((r) => String(r.merchant).startsWith("SECRET-OTHER-USER"))).toBe(true);
  });
});
