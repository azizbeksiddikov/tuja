# bank-app progress log

Working name: `bank-app` (set `NEXT_PUBLIC_APP_NAME`). Plan: `2-tech/3-jobs/career/banking-app-plan-2026-10-21.md` (AI = Gemini, scope = 1 day).

## 2026-10-24
- [x] Fresh repo from `adrianhajdin/banking@eb59006` (files only, no upstream history, upstream example env file left out); tagged `upstream-baseline`.
- [x] Moved code into `src/`; removed Appwrite, Dwolla, Sentry.
- [x] Next 16.4 + React 19.3, Prisma 7 (adapter-pg), Better Auth, Gemini SDK, libpg-query installed.
- [x] Prisma schema: Better Auth tables + bank_accounts / transactions (amount_minor BIGINT + currency) / plaid_items (encrypted token) / transfers (idempotency key) / fx_rates / sql_audit / agent_runs.
- [x] Migration `guarded_sql`: NOLOGIN role `app_ro_sql`, security_invoker views `v_accounts`, `v_transactions`, `v_fx_rates`, RLS policies on `app.user_id`, column-level grants.
- [x] `src/lib/pg-guard/` (self-contained): AST validation + guarded executor; 52 Vitest cases pass.
- [x] Demo persona generator + seed (~290 transactions over 6 months, UZS/KRW/USD, one prompt-injection memo) + isolation test user.
- [x] CBU FX fetcher (latest + historical) with fallback rates.
- [ ] App rewrite onto Postgres (pages, auth, demo login, currency switcher)
- [ ] Gemini agent + chat UI with tool trace
- [ ] Plaid sandbox fixes (only when PLAID_CLIENT_ID set)
- [ ] Evals + README table
- [ ] Dockerfile + docker-compose.prod.yml
