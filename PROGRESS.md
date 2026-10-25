# Tuja progress log

Name: **Tuja** (repo `azizbeksiddikov/tuja`, private). Live target: https://tuja.azbek.me. Plan: `2-tech/3-jobs/career/banking-app-plan-2026-10-21.md` (AI = Gemini, scope = 1 day).

## 2026-10-24
- [x] Fresh repo from `adrianhajdin/banking@eb59006` (files only, no upstream history, upstream example env file left out); tagged `upstream-baseline`.
- [x] Moved code into `src/`; removed Appwrite, Dwolla, Sentry.
- [x] Next 16.4 + React 19.3, Prisma 7 (adapter-pg), Better Auth, Gemini SDK, libpg-query installed.
- [x] Prisma schema: Better Auth tables + bank_accounts / transactions (amount_minor BIGINT + currency) / plaid_items (encrypted token) / transfers (idempotency key) / fx_rates / sql_audit / agent_runs.
- [x] Migration `guarded_sql`: NOLOGIN role `app_ro_sql`, security_invoker views `v_accounts`, `v_transactions`, `v_fx_rates`, RLS policies on `app.user_id`, column-level grants.
- [x] `src/lib/pg-guard/` (self-contained): AST validation + guarded executor; 52 Vitest cases pass.
- [x] Demo persona generator + seed (~290 transactions over 6 months, UZS/KRW/USD, one prompt-injection memo) + isolation test user.
- [x] CBU FX fetcher (latest + historical) with fallback rates.
- [x] Repo renamed to `tuja` (private), remote updated. Untracked `tests/` reviewed and committed (one float assertion fixed).
- [x] App rewrite onto Postgres: Horizon UI/Appwrite removed; Better Auth via server actions; HTTP auth routes limited to get-session/sign-out (so nobody can change the public demo password); one-click "Try the demo"; dashboard (balance, accounts, month spend/income, categories, recent); transactions with filters + pagination; currency switcher KRW/UZS/USD (cookie, CBU rates). Every query is scoped by the session user; URL account ids are checked for ownership (IDOR fix).
- [x] Style C "Hanji" applied while rewriting: tokens live only in `src/app/globals.css` + `tailwind.config.ts`; Noto Sans KR loaded at runtime (next/font timed out on its subsets); mobile bottom tab bar, 2-column desktop.
- [x] Gemini agent (`src/lib/agent`): tools get_balances, search_transactions, spending_summary, convert, run_readonly_sql (pg-guard + RLS + sql_audit). NDJSON streaming `/api/chat`, chat UI with collapsible tool/SQL trace. Quotas: 6/min burst, demo 20/h per IP + 300/day shared, users 30/day (agent_runs). No write tools.
  - Model: `gemini-3.8-flash` (listed as stable in Google docs) returned 504 DEADLINE_EXCEEDED on every call on 2026-10-24, so default = `gemini-3.6-flash`, with automatic fallback to `gemini-3.5-flash-lite` on timeout/5xx.
- [x] Plaid sandbox: Transactions product in link token (B2), cursor loop that appends and restarts on mutation (B1), personal_finance_category (B3), all accounts (B8), AES-256-GCM tokens (B6). Unit tests + `scripts/plaid-sandbox-check.ts` verified against real sandbox (14 accounts, 17 txns on initial update, token encrypted, cursor saved).
- [x] Dockerfile (standalone, 1.55 GB) + `docker-compose.prod.yml` (app on 127.0.0.1:3100 + postgres:16, no published DB port). Entrypoint: prisma migrate deploy, then idempotent seed, then server. Tested locally with dummy values: first boot + restart on the same volume (no pending migrations, no duplicate rows), demo login works, "AI not configured" shown without keys. ~65 MB RAM for the app at idle.
- [ ] Deploy (Mark): server env file + nginx + DNS
- [ ] Evals (>=15 factual + >=10 adversarial on real Gemini) + README
