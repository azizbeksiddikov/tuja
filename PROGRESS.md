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
- [x] Deploy by Mark (VPS, nginx + TLS for tuja.azbek.me).
- [x] Evals harness: 19 factual (SQL ground truth) + 15 adversarial (`evals/`). Guard/RLS layer with no model: 15/15 stopped, 0 leaks, row counts unchanged (`evals/results-guard.md`).
  - BLOCKER for the model evals AND the live assistant: the Gemini key is on the FREE tier = 20 requests/day/model (5/min) for gemini-3.6-flash; one question uses 2-3 requests. The quota ran out during the eval run (6/6 completed factual answers were correct; the rest got 429). Fix: enable billing on the AI Studio project (Tier 1, instant), then run `npm run eval` and paste the summary into the README.
  - The agent now falls back to gemini-3.5-flash-lite on 429 and shows "The AI is at its rate limit right now" instead of a generic error.
- [x] README rewritten (live link, B1-B11 table, architecture, security, evals, credit); LICENSE has a copyright line for my changes; landing example replaced with a real model answer.

## 2026-10-25 (polish before the owner's manual check)
- [x] FX: cbu.uz times out from the German VPS, so prod showed static fallback rates. Chain is now CBU (3 s timeout) → ExchangeRate-API open endpoint (keyless, has UZS + KRW, attribution link shown on the dashboard and in the footer as its terms require) → static table. Refresh runs in the background (pages wait only if fx_rates is empty), rows store their `source`, backup rows never overwrite CBU rows, UI and agent tools name the real source. `tests/fx.test.ts` (mocked fetch + DB storage rules).
- [x] Mobile audit with Playwright at 360/390/768/1280 on landing, sign-in/up, dashboard, transactions, assistant, More (demo and real user with Plaid): fixed page overflow on dashboard (426px at 360) and transactions (432px), all tap targets ≥ 40px, tab bar as a 4-column grid, amounts never wrap, secondary filters folded into "More filters". Screenshots in `docs/screenshots/`, three in the README.
- [x] Demo freshness: `src/lib/demo/refresh.ts` `ensureDemoFresh()` on demo sign-in, demo page loads and demo chat; reseeds when demo accounts were created before today (UTC), Postgres advisory xact lock (one reseed across processes), whole reseed in one transaction. No new container/cron. `tests/demo-refresh.test.ts`.
- [x] Error states: typed error codes; rate limit / quota / not configured show a recorded real answer; 401, 502/504 HTML, offline, cut-off stream, malformed lines handled; "Try again"; `error.tsx`, `global-error.tsx`, `not-found.tsx` (checked with Postgres stopped: friendly page, no stack); Plaid Link network/config messages.
- [x] Demo flow: suggestion chips relative to today's months (demo data always ends today); dashboard "Ask AI" card prefills its question in the assistant.
- [x] 82 tests pass, typecheck clean, `next build` clean. One real Gemini question used (answered by the fallback model gemini-3.5-flash-lite in 3.1 s).
- [ ] Mark: redeploy (no migration needed).
