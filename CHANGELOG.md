# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Fixed

### Security

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
