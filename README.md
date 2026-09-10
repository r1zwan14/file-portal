# File Portal

**Version:** [0.1.0](CHANGELOG.md#010---2026-09-10)

Self-hosted, read-only S3 file portal for sharing files from an existing AWS S3 bucket with external clients.

S3 remains the single source of truth for files. MySQL stores only application state (users, sessions, permissions, audit logs).

## Features

- Email/password auth with Argon2id and HttpOnly session cookies
- ADMIN and VIEWER roles
- Per-user S3 bucket + prefix permissions
- Live S3 browsing via `ListObjectsV2` (no file sync/cache in MySQL)
- Presigned download URLs
- Admin user/permission management and audit logs
- CSRF protection, login rate limiting, Zod validation, OpenAPI docs

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for MySQL)
- AWS credentials with `s3:ListBucket` and `s3:GetObject` on the configured bucket(s)

## Quick start

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set AWS credentials, COOKIE_SECRET, SEED_ADMIN_PASSWORD, S3_ALLOWED_BUCKETS

# 3. Start MySQL
docker compose up -d

# 4. Generate Prisma client + migrate + seed
pnpm db:generate
# Load env then migrate (DATABASE_URL required)
set -a && source .env && set +a
pnpm --filter @portal/api exec prisma migrate dev --name init
pnpm db:seed

# 5. Run API + web
pnpm dev
```

- Web UI: http://localhost:5173
- API: http://localhost:4000
- OpenAPI docs: http://localhost:4000/docs

Default seed users (passwords from `.env`):

| Email | Role |
| --- | --- |
| `admin@example.com` | ADMIN |
| `client-a@example.com` | VIEWER (`client-a/` on first allowed bucket) |

## Environment variables

See `.env.example`.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | MySQL connection string |
| `AWS_REGION` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | S3 access (or use IAM role credentials) |
| `S3_ALLOWED_BUCKETS` | Comma-separated allowlist of buckets |
| `S3_PRESIGNED_URL_EXPIRATION` | Download URL TTL in seconds |
| `SESSION_EXPIRATION_HOURS` | Session lifetime |
| `COOKIE_SECRET` | Cookie signing secret (min 32 chars) |
| `COOKIE_SECURE` | Set `true` behind HTTPS |
| `CORS_ORIGIN` | Frontend origin (must not be `*` with cookies) |
| `SEED_ADMIN_PASSWORD` / `SEED_VIEWER_PASSWORD` | Seed script passwords |

## Architecture notes

- **S3 is authoritative.** There is no `files` table and no sync worker.
- Authorization is enforced on the API with `canAccessObject` / `canListPrefix`.
- Downloads never stream through Node; the API returns a short-lived presigned URL.
- CSRF uses a double-submit cookie (`csrf_token` readable cookie + `x-csrf-token` header).
- Login rate limiting is in-memory (`@fastify/rate-limit`). Multi-instance production may need a shared store later.

## Scripts

```bash
pnpm dev          # API + web
pnpm test         # Authorization + unit tests
pnpm db:migrate   # Prisma migrate (dev)
pnpm db:seed      # Seed admin/viewer
pnpm build        # Build all packages
```

## Security model (summary)

1. Authenticate session cookie
2. Load user permissions (admins get configured buckets)
3. Reject requests outside allowed bucket/prefix
4. Only then call S3 or issue a presigned URL

Viewers cannot upload, delete, rename, move, or manage users.

## Tests

```bash
pnpm test
```

Critical authorization cases (client-a vs client-b/internal) are covered in `apps/api/src/services/authorization.service.test.ts`.

## Versioning

This project uses [Semantic Versioning](https://semver.org/). See [CHANGELOG.md](CHANGELOG.md) for release notes.

## License

This project is licensed under the [MIT License](LICENSE).
