#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
export DATABASE_URL="mysql://portal_test:portal_test@127.0.0.1:3307/file_portal_test"

cleanup() {
  docker compose -p file-portal-security-test -f docker-compose.test.yml down --volumes >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose -p file-portal-security-test -f docker-compose.test.yml up -d --wait
pnpm build:packages
pnpm --filter @portal/api exec prisma migrate deploy
pnpm --filter @portal/api test:security
