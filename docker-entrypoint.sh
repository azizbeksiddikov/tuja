#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is not set" >&2
  exit 1
fi

echo "[entrypoint] applying migrations"
/app/node_modules/.bin/prisma migrate deploy

if [ "${SEED_ON_START:-1}" = "1" ]; then
  echo "[entrypoint] seeding demo persona (idempotent)"
  /app/node_modules/.bin/tsx scripts/seed.ts --backfill-if-needed || echo "[entrypoint] seed failed, continuing" >&2
fi

echo "[entrypoint] starting server on :${PORT:-3000}"
cd /app/server
exec node server.js
