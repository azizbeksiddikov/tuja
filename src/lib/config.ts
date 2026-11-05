// Central place for configuration. Every external integration is optional:
// the app runs fully (demo mode, FX, guarded SQL) with only DATABASE_URL.

const env = process.env;

export const APP_NAME = env.NEXT_PUBLIC_APP_NAME || env.APP_NAME || "Tuja";

const DEV_DB = "postgresql://bank:bank@localhost:4221/bank"; // docker-compose.yml, dev only

export const config = {
  appName: APP_NAME,
  databaseUrl: env.DATABASE_URL || (env.NODE_ENV === "production" ? "" : DEV_DB),
  baseUrl: env.BETTER_AUTH_URL || env.APP_URL || "http://localhost:4220",
  gemini: {
    apiKey: env.GEMINI_API_KEY || "",
    model: env.GEMINI_MODEL || "gemini-3.6-flash",
    // Used when the primary model times out or returns 5xx (gemini-3.8-flash was timing out on 2026-10-24).
    fallbackModel: env.GEMINI_FALLBACK_MODEL ?? "gemini-3.5-flash-lite",
    timeoutMs: Number(env.GEMINI_TIMEOUT_MS || 25000),
  },
  plaid: {
    clientId: env.PLAID_CLIENT_ID || "",
    secret: env.PLAID_SECRET || "",
    env: env.PLAID_ENV || "sandbox",
  },
  encryptionKey: env.ENCRYPTION_KEY || "",
  cronSecret: env.CRON_SECRET || "",
  demo: {
    dailyMessageCap: Number(env.DEMO_DAILY_MESSAGES || 300),
  },
  userDailyMessageCap: Number(env.USER_DAILY_MESSAGES || 30),
  sqlRole: env.SQL_GUARD_ROLE || "app_ro_sql",
};

export const isAiConfigured = () => Boolean(config.gemini.apiKey);
export const isPlaidConfigured = () => Boolean(config.plaid.clientId && config.plaid.secret);
