# File Portal

**Version:** [0.2.0](CHANGELOG.md)

Self-hosted, read-only S3 file portal for sharing files from an existing AWS S3 bucket with external clients.

S3 remains the single source of truth for files. MySQL stores only application state (users, sessions, permissions, audit logs).

## Features

- Email/password auth with Argon2id and HttpOnly session cookies
- **ADMIN**, **MANAGER**, and **VIEWER** roles with least-privilege UI/API access
  - Admins: full control — users, permissions, audit logs, dashboard
  - Managers: create/delete/manage Viewer users and their S3 permissions only
  - Viewers: browse and download files within their assigned buckets/prefixes
- Per-user S3 bucket + prefix permissions (leave prefix blank to grant full-bucket access)
- Live S3 browsing via `ListObjectsV2` (no file sync/cache in MySQL)
- List and grid/block view toggle in the file browser (preference saved in browser)
- Presigned download URLs — files never stream through the API; supports 2–3 GB objects
- Admin user/permission management and audit logs
- Dark mode with system-default detection and a manual toggle
- Signed CSRF protection, layered rate limits, Zod validation, and development-only OpenAPI docs

## Prerequisites

- Docker Engine with Docker Compose
- AWS credentials with `s3:ListBucket` and `s3:GetObject` on the configured bucket(s)

## Quick start

```bash
# 1. Configure environment
cp .env.example .env
# Set AWS/S3 values, strong secrets, and INITIAL_ADMIN_*.
# For a remote hostname, also set CORS_ORIGIN, PUBLIC_ORIGIN and VITE_ALLOWED_HOSTS.

# 2. Build and run web + API + MySQL. Migrations and one-time admin
# bootstrap run automatically.
docker compose up -d --build

# 3. Check the complete stack
docker compose ps
docker compose logs -f api web
```

- Web UI: http://localhost:5173
- API: http://localhost:4000
- OpenAPI docs: http://localhost:4000/docs

Only `INITIAL_ADMIN_EMAIL` is created automatically. The bootstrap is idempotent and
does not reset an existing password. Create every Manager and Viewer from the UI after
signing in as that administrator.

The development Compose stack publishes web and API on loopback by default so an
existing host Nginx can proxy them. Set `DEV_BIND_ADDRESS` only when the ports must bind
another private interface. Configure the existing Nginx separately; this repository
does not install or modify it.

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
| `CURSOR_SECRET` | HMAC secret for S3 pagination cursors |
| `COOKIE_SECURE` | Set `true` behind HTTPS |
| `CORS_ORIGIN` | Frontend origin (must not be `*` with cookies) |
| `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` | One-time initial administrator bootstrap |

## Architecture notes

- **S3 is authoritative.** There is no `files` table and no sync worker.
- Authorization is enforced on the API with `canAccessObject` / `canListPrefix`.
- Downloads never stream through Node; the API returns a short-lived presigned URL.
- Multi-gigabyte objects (including 2–3 GB files) are supported because their contents
  transfer directly from S3 to the browser. The API and proxy handle only metadata and
  the small presigned-URL response; `BODY_LIMIT_BYTES` is intentionally not increased.
- CSRF uses a double-submit cookie (`csrf_token` readable cookie + `x-csrf-token` header).
- Rate limiting is in-memory (`@fastify/rate-limit`). Use a shared store at the edge for multi-instance deployments.

## Production deployment

Production runs the unprivileged Nginx web container as the only published service; the
API remains on the internal Compose network. TLS must terminate at a trusted external
load balancer or reverse proxy in front of port `8080`.

1. Copy `.env.production.example` to `.env.production` and replace every placeholder.
2. Set `PUBLIC_ORIGIN` and `CORS_ORIGIN` to the same HTTPS origin.
3. Keep `TRUST_PROXY=172.30.0.3/32` for the bundled Nginx proxy. Numeric hop counts
   and trust-all settings are rejected. Keep `WEB_BIND_ADDRESS=127.0.0.1` when the
   TLS proxy is on this host; for a remote load balancer, bind only a private interface
   and enforce an allowlist in the host firewall.
4. Use a managed MySQL database and mount its CA certificate. The Prisma URL must
   include `sslcert=/run/secrets/db-ca.pem&sslaccept=strict`; set `DB_CA_PATH` to the
   host CA file.
5. Prefer an attached IAM role with only `s3:ListBucket` and `s3:GetObject` on the
   allowed bucket/prefixes. If static AWS keys are unavoidable, both values are required.
6. Build, migrate, and create the one initial administrator:

```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml run --rm \
  -e RUN_MIGRATIONS=true api node dist/scripts/bootstrap-admin.js
```

The bootstrap is idempotent and never resets an existing administrator. Immediately
remove `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`, and `INITIAL_ADMIN_NAME` from
`.env.production`, then start the service:

```bash
docker compose -f docker-compose.prod.yml up -d
curl --fail https://files.example.com/health
```

Do not expose the API container or MySQL publicly. Restrict inbound traffic to the TLS
proxy, enable HSTS at that proxy, and forward the original `X-Forwarded-Proto` value.
`/docs` is disabled in production.

### Production operations

- Apply migrations before each rollout with `pnpm db:migrate:deploy` or the one-off
  container command above. The session-hardening migration intentionally logs out all
  existing users.
- Rotate cookie/cursor secrets and AWS credentials through the deployment secret store.
  Cookie-secret rotation invalidates sessions; cursor-secret rotation invalidates only
  active pagination cursors.
- Back up MySQL with encrypted, access-controlled, restore-tested snapshots. S3 remains
  authoritative and should use versioning/retention appropriate to your data policy.
- Review audit logs and proxy/API rate-limit telemetry. Never log object query strings,
  cookies, CSRF values, database URLs, AWS keys, or presigned URLs.
- Patch base images and dependencies regularly, then rerun all verification commands.

## Scripts

```bash
pnpm test         # Authorization + unit tests
pnpm test:security # Disposable MySQL + auth/role/proxy/S3 security integration tests
pnpm build        # Build all packages
docker compose up -d --build # Complete development stack
docker compose down          # Stop it (MySQL data is retained at ./data/mysql)
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
pnpm test:security
pnpm lint
pnpm build
pnpm audit --prod
```

The security suite covers authentication/session hashing, CSRF/origin/CORS, role
boundaries, Manager permission containment, rate limiting, trusted proxy handling,
security headers, signed S3 cursors, mocked S3 failures, and production config rejection.

## Versioning

This project uses [Semantic Versioning](https://semver.org/). See [CHANGELOG.md](CHANGELOG.md) for release notes.

## License

This project is licensed under the [MIT License](LICENSE).
