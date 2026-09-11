# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-09-11

### Added

- Dark mode with light/dark toggle; default follows the browser/system preference
- **MANAGER** role: create/delete/manage **VIEWER** users and their S3 permissions only
- User delete API/UI (`DELETE /api/admin/users/:id`)
- Grid/block view for the file browser with a list/grid toggle (preference persisted to `localStorage`)
- Empty prefix support on permissions — leave prefix blank to grant a viewer access to an entire bucket
- HTTP site file for an existing host Nginx in front of the development stack
- Hardened production API and unprivileged Nginx images with an internal-only API network
- Fail-closed production configuration and idempotent initial-admin bootstrap
- Disposable MySQL-backed security integration test suite
- Single-command Docker Compose development stack for web, API, migrations, bootstrap, and MySQL
- MySQL data bind-mounted to `./data/mysql` on the host for easy backup and persistence

### Changed

- Admin dashboard and audit logs remain **ADMIN**-only
- Viewers only see Files (no users, audit logs, or recent activity)
- Managers see Files + Users; no dashboard/audit/recent activity
- Development bootstrap now creates only one initial administrator; sample Manager and
  Viewer accounts are no longer seeded
- Local Node/pnpm startup instructions replaced by Docker Compose deployment suitable
  for an existing development server and host-managed Nginx
- MySQL data stored as a host bind-mount at `./data/mysql` instead of a named Docker volume
- Origin header check now skipped in development (Vite proxy compatibility); enforced
  strictly in production and test environments

### Fixed

- `403 Request origin is not allowed` when accessing the app through the Vite dev-server
  proxy (Nginx → Vite → API) even with correct `PUBLIC_ORIGIN`/`CORS_ORIGIN` values
- `db-init` failing on fresh MySQL volume due to healthcheck race condition; fixed with
  `start_period: 40s`, 30 retries, and a retry loop in the init command
- S3 permission form blocked empty prefix (entire-bucket access) via a spurious
  `required` attribute on the prefix input

### Security

- Managers cannot create/promote/manage ADMIN or MANAGER accounts
- Managers can grant only non-root S3 prefixes contained within their own permissions
- Audit log endpoints require ADMIN
- Session bearer tokens are SHA-256 hashed at rest; role, permission, password, disable,
  delete, and logout changes invalidate affected sessions
- Production uses signed `__Host-` cookies, signed constant-time CSRF checks, strict
  Origin/CORS validation, explicit trusted-proxy CIDRs, HTTPS enforcement, CSP, no-store
  API responses, bounded request/TTL settings, and layered rate limits
- S3 pagination cursors are HMAC-bound to bucket/prefix, bucket discovery is
  permission-filtered, download filenames are safely encoded, and AWS errors are sanitized
- Swagger and third-party fonts are disabled/removed for production
- Production dependencies upgraded with zero known high/critical audit findings
- Multi-gigabyte downloads remain direct browser-to-S3 transfers and do not traverse
  the API or development proxy

## [0.1.0] - 2026-09-10

Initial public release of **File Portal**.

### Added

- pnpm monorepo with React/Vite frontend and Fastify/TypeScript API
- MySQL + Prisma models for users, sessions, S3 permissions, and audit logs
- Email/password authentication with Argon2id and HttpOnly session cookies
- CSRF double-submit cookie protection and login rate limiting
- ADMIN and VIEWER roles with protected admin APIs and UI
- Read-only S3 browsing via `ListObjectsV2` (S3 as source of truth; no file sync tables)
- Per-user bucket + prefix authorization enforced on the backend
- Presigned download URLs (files are not streamed through the API)
- Viewer file browser with breadcrumbs, search, and downloads
- Admin dashboard: user CRUD, enable/disable, password reset, permission management, audit logs
- OpenAPI docs at `/docs`, health endpoints, Docker Compose MySQL for local development
- Authorization unit tests and MIT license
