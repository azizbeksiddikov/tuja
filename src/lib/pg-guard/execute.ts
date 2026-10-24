import type { PoolLike, RunOptions, RunResult } from "./types";
import { validateSelect } from "./validate";

const IDENT = /^[a-z_][a-z0-9_]*$/;
const SETTING = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/;

/**
 * Validate and execute untrusted SQL with defense in depth:
 *  1. AST check (single SELECT, relation + function allowlists)        -> validateSelect
 *  2. READ ONLY transaction                                             -> BEGIN READ ONLY
 *  3. statement_timeout                                                  -> SET LOCAL
 *  4. least-privilege role with RLS                                      -> SET LOCAL ROLE
 *  5. per-transaction user scope read by the RLS policies               -> set_config(..., true)
 *  6. hard row cap                                                       -> outer LIMIT
 *  7. audit callback for every attempt (blocked, failed or ok)
 * The transaction is always rolled back.
 */
export async function runGuardedQuery(pool: PoolLike, sql: string, opts: RunOptions): Promise<RunResult> {
  const started = Date.now();
  const maxRows = Math.max(1, Math.min(opts.maxRows ?? 500, 10_000));
  const timeoutMs = Math.max(100, Math.min(opts.timeoutMs ?? 3000, 60_000));
  const settingName = opts.settingName ?? "app.user_id";
  const audit = async (e: Parameters<NonNullable<RunOptions["onAudit"]>>[0]) => {
    try {
      await opts.onAudit?.(e);
    } catch {
      /* audit must never break the request */
    }
  };

  if (!opts.userId) throw new Error("pg-guard: userId is required");
  if (opts.role && !IDENT.test(opts.role)) throw new Error("pg-guard: invalid role name");
  if (!SETTING.test(settingName)) throw new Error("pg-guard: invalid setting name");

  const v = await validateSelect(sql, opts.policy);
  if (!v.ok) {
    const durationMs = Date.now() - started;
    await audit({ userId: opts.userId, sql, status: "blocked", reason: `${v.code}: ${v.reason}`, durationMs });
    return { ok: false, status: "blocked", code: v.code, reason: v.reason, durationMs };
  }

  // Newline before ")" so a trailing "-- comment" in the inner query cannot swallow it.
  const executedSql = `SELECT * FROM (\n${v.sql}\n) AS pg_guard_q LIMIT ${maxRows + 1}`;

  const client = await pool.connect();
  let broken = false;
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL statement_timeout = ${timeoutMs}`);
    await client.query("SET LOCAL idle_in_transaction_session_timeout = 10000");
    await client.query("SET LOCAL search_path = public");
    if (opts.role) await client.query(`SET LOCAL ROLE ${opts.role}`);
    await client.query("SELECT set_config($1, $2, true)", [settingName, opts.userId]);
    const res = await client.query(executedSql);
    const truncated = res.rows.length > maxRows;
    const rows = truncated ? res.rows.slice(0, maxRows) : res.rows;
    const columns = res.fields?.map((f) => f.name) ?? Object.keys(rows[0] ?? {});
    const durationMs = Date.now() - started;
    await audit({ userId: opts.userId, sql, status: "ok", rowCount: rows.length, durationMs });
    return { ok: true, columns, rows, rowCount: rows.length, truncated, durationMs, executedSql };
  } catch (e) {
    const durationMs = Date.now() - started;
    const reason = (e as Error).message;
    await audit({ userId: opts.userId, sql, status: "error", reason, durationMs });
    return { ok: false, status: "error", reason, durationMs };
  } finally {
    try {
      await client.query("ROLLBACK");
    } catch {
      broken = true;
    }
    client.release(broken);
  }
}
