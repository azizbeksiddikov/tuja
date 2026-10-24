-- Guarded Text-to-SQL surface (see src/lib/pg-guard).
-- 1. A NOLOGIN read-only role the app switches into with SET LOCAL ROLE.
-- 2. security_invoker views, so Row-Level Security on the base tables applies to the caller.
-- 3. RLS policies keyed on the transaction-local setting app.user_id.
-- 4. Column-level grants: the role can never see tokens, Plaid ids or other users' rows.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_ro_sql') THEN
    CREATE ROLE app_ro_sql NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

-- Let the application (migration) user switch into the role.
DO $$
BEGIN
  EXECUTE format('GRANT app_ro_sql TO %I', current_user);
END
$$;

CREATE OR REPLACE FUNCTION minor_unit_divisor(ccy text) RETURNS numeric
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE upper(ccy) WHEN 'KRW' THEN 1 WHEN 'JPY' THEN 1 ELSE 100 END::numeric
$$;

CREATE VIEW v_accounts WITH (security_invoker = true) AS
SELECT a.id,
       a.name,
       a.institution,
       a.type,
       a.subtype,
       a.currency,
       a.balance_minor,
       a.balance_minor / minor_unit_divisor(a.currency) AS balance
FROM bank_accounts a;

CREATE VIEW v_transactions WITH (security_invoker = true) AS
SELECT t.id,
       t.account_id,
       a.name AS account_name,
       t.booked_at,
       t.merchant,
       t.category,
       t.channel,
       t.currency,
       t.amount_minor,
       t.amount_minor / minor_unit_divisor(t.currency) AS amount,
       CASE WHEN t.amount_minor < 0 THEN 'out' ELSE 'in' END AS direction,
       t.pending,
       t.memo
FROM transactions t
JOIN bank_accounts a ON a.id = t.account_id;

CREATE VIEW v_fx_rates WITH (security_invoker = true) AS
SELECT date, code, rate_uzs FROM fx_rates;

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY ro_own_accounts ON bank_accounts FOR SELECT TO app_ro_sql
  USING (user_id = current_setting('app.user_id', true));
CREATE POLICY ro_own_transactions ON transactions FOR SELECT TO app_ro_sql
  USING (user_id = current_setting('app.user_id', true));

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_ro_sql;
GRANT USAGE ON SCHEMA public TO app_ro_sql;
GRANT SELECT (id, user_id, name, institution, type, subtype, currency, balance_minor) ON bank_accounts TO app_ro_sql;
GRANT SELECT (id, user_id, account_id, booked_at, merchant, category, channel, currency, amount_minor, pending, memo) ON transactions TO app_ro_sql;
GRANT SELECT ON fx_rates TO app_ro_sql;
GRANT SELECT ON v_accounts, v_transactions, v_fx_rates TO app_ro_sql;
GRANT EXECUTE ON FUNCTION minor_unit_divisor(text) TO app_ro_sql;
