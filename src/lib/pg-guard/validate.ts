import { parse } from "libpg-query";
import type { GuardErrorCode, GuardPolicy, ValidationResult } from "./types";

/** Conservative default: aggregates, math, string, date helpers. No I/O, no sleeps, no settings. */
export const DEFAULT_ALLOWED_FUNCTIONS = [
  "count", "sum", "avg", "min", "max", "bool_and", "bool_or", "string_agg", "array_agg",
  "round", "abs", "ceil", "ceiling", "floor", "trunc", "sign", "greatest", "least", "coalesce", "nullif",
  "lower", "upper", "trim", "btrim", "ltrim", "rtrim", "length", "char_length", "substring", "substr",
  "position", "strpos", "replace", "concat", "concat_ws", "left", "right", "split_part", "initcap",
  "date_trunc", "date_part", "extract", "to_char", "to_date", "make_date", "age", "now",
  "percentile_cont", "percentile_disc", "stddev", "variance", "row_number", "rank", "dense_rank",
  "lag", "lead", "first_value", "last_value", "ntile",
  "minor_unit_divisor",
];

// Casts to reg* types resolve catalog objects by name; block them outright.
const FORBIDDEN_CAST_PREFIX = "reg";

// Node types that are never acceptable anywhere in the tree.
const FORBIDDEN_NODES = new Set([
  "RangeFunction", // SELECT * FROM some_function()
  "RangeTableFunc", // XMLTABLE
  "RangeTableFuncCol",
  "ParamRef",
  "CurrentOfExpr",
  "LockingClause",
  "IntoClause",
  "InsertStmt",
  "UpdateStmt",
  "DeleteStmt",
  "MergeStmt",
  "CreateTableAsStmt",
  "CopyStmt",
  "CallStmt",
  "DoStmt",
  "VariableSetStmt",
  "NotifyStmt",
  "ListenStmt",
  "TransactionStmt",
  "XmlExpr",
  "XmlSerialize",
]);

type Fail = { ok: false; code: GuardErrorCode; reason: string };
const fail = (code: GuardErrorCode, reason: string): Fail => ({ ok: false, code, reason });

function stringList(nodes: unknown): string[] {
  if (!Array.isArray(nodes)) return [];
  return nodes
    .map((n) => (n && typeof n === "object" && "String" in n ? (n as { String: { sval?: string } }).String.sval : undefined))
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.toLowerCase());
}

export function stripTrailingSemicolons(sql: string): string {
  let s = sql.trim();
  while (s.endsWith(";")) s = s.slice(0, -1).trimEnd();
  return s;
}

/**
 * Validate that `sql` is exactly one plain SELECT that reads only allowlisted relations and
 * calls only allowlisted functions. Uses the real Postgres parser (libpg_query, WASM).
 */
export async function validateSelect(sql: string, policy: GuardPolicy): Promise<ValidationResult> {
  const maxLen = policy.maxSqlLength ?? 4000;
  const trimmed = stripTrailingSemicolons(sql ?? "");
  if (!trimmed) return fail("EMPTY", "Empty query");
  if (trimmed.length > maxLen) return fail("TOO_LONG", `Query longer than ${maxLen} characters`);

  let tree: { stmts?: { stmt: Record<string, unknown> }[] };
  try {
    tree = (await parse(trimmed)) as typeof tree;
  } catch (e) {
    return fail("PARSE_ERROR", `Postgres parser rejected the query: ${(e as Error).message}`);
  }

  const stmts = tree.stmts ?? [];
  if (stmts.length !== 1) return fail("MULTIPLE_STATEMENTS", `Expected exactly 1 statement, got ${stmts.length}`);

  const root = stmts[0].stmt;
  const rootType = Object.keys(root)[0];
  if (rootType !== "SelectStmt") return fail("NOT_SELECT", `Only SELECT is allowed, got ${rootType}`);

  const allowedRelations = new Set(policy.allowedRelations.map((r) => r.toLowerCase()));
  const allowedFunctions = new Set((policy.allowedFunctions ?? DEFAULT_ALLOWED_FUNCTIONS).map((f) => f.toLowerCase()));

  // CTE names are legal relation names inside the statement.
  const cteNames = new Set<string>();
  const relations = new Set<string>();
  const functions = new Set<string>();
  let error: Fail | null = null;

  const visit = (node: unknown): void => {
    if (error || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (error) return;
      if (FORBIDDEN_NODES.has(key)) {
        error = key === "LockingClause"
          ? fail("LOCKING_CLAUSE", "FOR UPDATE/SHARE is not allowed")
          : key === "IntoClause"
            ? fail("SELECT_INTO", "SELECT INTO is not allowed")
            : key.endsWith("Stmt")
              ? fail("DATA_MODIFYING_CTE", `${key} is not allowed`)
              : fail("FORBIDDEN_NODE", `${key} is not allowed`);
        return;
      }
      if (key === "intoClause" && value) { error = fail("SELECT_INTO", "SELECT INTO is not allowed"); return; }
      if (key === "lockingClause" && Array.isArray(value) && value.length) {
        error = fail("LOCKING_CLAUSE", "FOR UPDATE/SHARE is not allowed");
        return;
      }
      if (key === "SelectStmt" && value && typeof value === "object") {
        const sel = value as Record<string, unknown>;
        if (sel.intoClause) { error = fail("SELECT_INTO", "SELECT INTO is not allowed"); return; }
        if (Array.isArray(sel.lockingClause) && sel.lockingClause.length) {
          error = fail("LOCKING_CLAUSE", "FOR UPDATE/SHARE is not allowed");
          return;
        }
      }
      if (key === "withClause" || key === "WithClause") {
        // Only the root statement may have a WITH clause (handled before the walk), so CTE
        // name scoping is unambiguous.
        error = fail("FORBIDDEN_NODE", "WITH is only allowed at the top level of the query");
        return;
      }
      if (key === "RangeVar") {
        const rv = value as { relname?: string; schemaname?: string; catalogname?: string };
        const schema = rv.schemaname?.toLowerCase();
        const rel = (rv.relname ?? "").toLowerCase();
        if (rv.catalogname || (schema && schema !== "public")) {
          error = fail("FORBIDDEN_SCHEMA", `Schema "${schema ?? rv.catalogname}" is not allowed`);
          return;
        }
        if (!schema && cteNames.has(rel)) {
          // reference to a CTE defined in this statement
        } else if (!allowedRelations.has(rel)) {
          error = fail("FORBIDDEN_RELATION", `Relation "${rel}" is not in the allowlist (${[...allowedRelations].join(", ")})`);
          return;
        } else {
          relations.add(rel);
        }
      }
      if (key === "FuncCall") {
        const fc = value as { funcname?: unknown[] };
        const parts = stringList(fc.funcname);
        const name = parts[parts.length - 1] ?? "";
        const schema = parts.length > 1 ? parts[0] : undefined;
        if (schema && schema !== "pg_catalog" && schema !== "public") {
          error = fail("FORBIDDEN_FUNCTION", `Function schema "${schema}" is not allowed`);
          return;
        }
        if (!allowedFunctions.has(name)) {
          error = fail("FORBIDDEN_FUNCTION", `Function "${name}" is not in the allowlist`);
          return;
        }
        functions.add(name);
      }
      if (key === "TypeCast") {
        const tc = value as { typeName?: { names?: unknown[] } };
        const names = stringList(tc.typeName?.names);
        const typ = names[names.length - 1] ?? "";
        if (typ.startsWith(FORBIDDEN_CAST_PREFIX) && typ !== "real") {
          error = fail("FORBIDDEN_CAST", `Cast to "${typ}" is not allowed`);
          return;
        }
      }
      visit(value);
    }
  };

  // Root-level WITH: CTEs are processed in order. A non-recursive CTE can only see the CTEs
  // defined before it, so a name is added to scope only after its own body was checked.
  const rootSelect = root.SelectStmt as Record<string, unknown>;
  const withClause = rootSelect.withClause as { WithClause?: unknown } | undefined;
  const w = (withClause && "WithClause" in withClause ? withClause.WithClause : withClause) as
    | { recursive?: boolean; ctes?: unknown[] }
    | undefined;
  if (w) {
    if (w.recursive && !policy.allowRecursiveCte) return fail("RECURSIVE_CTE", "WITH RECURSIVE is not allowed");
    for (const cte of w.ctes ?? []) {
      const c = (cte as { CommonTableExpr?: { ctename?: string; ctequery?: Record<string, unknown> } }).CommonTableExpr;
      if (!c) continue;
      const qType = c.ctequery ? Object.keys(c.ctequery)[0] : undefined;
      if (qType !== "SelectStmt") return fail("DATA_MODIFYING_CTE", `CTE "${c.ctename}" must be a SELECT, got ${qType}`);
      visit(c.ctequery);
      if (error) return error;
      if (c.ctename) cteNames.add(c.ctename.toLowerCase());
    }
  }
  const { withClause: _ignored, ...body } = rootSelect;
  void _ignored;
  visit({ SelectStmt: body });

  if (error) return error;
  return { ok: true, sql: trimmed, relations: [...relations], functions: [...functions] };
}
