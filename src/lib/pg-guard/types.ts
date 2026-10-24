/**
 * pg-guard: guarded, read-only execution of untrusted (e.g. LLM-written) SQL on Postgres.
 * This folder is self-contained (no app imports) so it can be extracted into its own package.
 */

export interface GuardPolicy {
  /** Relations (tables/views) the query may read, lower-case, unqualified or `public.` qualified. */
  allowedRelations: string[];
  /** Function names the query may call (lower-case). `pg_catalog.` prefix is accepted. */
  allowedFunctions?: string[];
  /** Max characters of SQL accepted. Default 4000. */
  maxSqlLength?: number;
  /** Allow WITH RECURSIVE. Default false. */
  allowRecursiveCte?: boolean;
}

export type GuardErrorCode =
  | "EMPTY"
  | "TOO_LONG"
  | "PARSE_ERROR"
  | "MULTIPLE_STATEMENTS"
  | "NOT_SELECT"
  | "SELECT_INTO"
  | "LOCKING_CLAUSE"
  | "FORBIDDEN_RELATION"
  | "FORBIDDEN_SCHEMA"
  | "FORBIDDEN_FUNCTION"
  | "FORBIDDEN_NODE"
  | "FORBIDDEN_CAST"
  | "RECURSIVE_CTE"
  | "DATA_MODIFYING_CTE";

export type ValidationResult =
  | {
      ok: true;
      /** The original statement, trimmed and without a trailing semicolon. */
      sql: string;
      relations: string[];
      functions: string[];
    }
  | { ok: false; code: GuardErrorCode; reason: string };

/** Minimal client/pool shapes so callers can pass a `pg.Pool` without this module importing pg. */
export interface QueryResultLike {
  rows: Record<string, unknown>[];
  fields?: { name: string }[];
}
export interface ClientLike {
  query(text: string, params?: unknown[]): Promise<QueryResultLike>;
  release(err?: Error | boolean): void;
}
export interface PoolLike {
  connect(): Promise<ClientLike>;
}

export interface AuditEvent {
  userId: string;
  sql: string;
  status: "ok" | "blocked" | "error";
  reason?: string;
  rowCount?: number;
  durationMs: number;
}

export interface RunOptions {
  /** Value written to the RLS setting for this transaction only. */
  userId: string;
  policy: GuardPolicy;
  /** Role to SET LOCAL ROLE into (must be a NOLOGIN read-only role with RLS policies). */
  role?: string;
  /** Name of the transaction-local setting the RLS policies read. Default `app.user_id`. */
  settingName?: string;
  /** statement_timeout in ms. Default 3000. */
  timeoutMs?: number;
  /** Rows returned at most (the query is wrapped in an outer LIMIT). Default 500. */
  maxRows?: number;
  onAudit?: (event: AuditEvent) => void | Promise<void>;
}

export type RunResult =
  | {
      ok: true;
      columns: string[];
      rows: Record<string, unknown>[];
      rowCount: number;
      truncated: boolean;
      durationMs: number;
      executedSql: string;
    }
  | { ok: false; status: "blocked" | "error"; code?: GuardErrorCode; reason: string; durationMs: number };
