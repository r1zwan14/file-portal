#!/bin/sh
set -eu

cd /app/apps/api

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  ../../node_modules/.bin/prisma migrate deploy
fi

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

exec node dist/server.js
