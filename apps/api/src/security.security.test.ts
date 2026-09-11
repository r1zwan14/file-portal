import argon2 from 'argon2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { hashSessionToken } from './utils/session.js';

const s3Mock = mockClient(S3Client);
let app: FastifyInstance;

type Session = { cookie: string; csrf: string };
let loginIp = 10;

function setCookies(response: { headers: Record<string, string | string[] | undefined> }): Session {
  const values = response.headers['set-cookie'];
  const cookies = Array.isArray(values) ? values : values ? [values] : [];
  const pairs = cookies.map((value) => value.split(';')[0]!);
  const csrfPair = pairs.find((value) => value.startsWith('csrf_token='))!;
  return {
    cookie: pairs.join('; '),
    csrf: decodeURIComponent(csrfPair.slice('csrf_token='.length)),
  };
}

async function login(email: string, password = 'Password1'): Promise<Session> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    remoteAddress: `192.0.2.${loginIp++}`,
    headers: { origin: 'http://localhost:5173' },
    payload: { email, password },
  });
  expect(response.statusCode).toBe(200);
  return setCookies(response);
}

function authHeaders(session: Session, csrf = false) {
  return {
    cookie: session.cookie,
    origin: 'http://localhost:5173',
    ...(csrf ? { 'x-csrf-token': session.csrf } : {}),
  };
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  await app.prisma.auditLog.deleteMany();
  await app.prisma.session.deleteMany();
  await app.prisma.s3Permission.deleteMany();
  await app.prisma.user.deleteMany();

  const passwordHash = await argon2.hash('Password1', { type: argon2.argon2id });
  const [admin, manager, viewer, disabled] = await Promise.all([
    app.prisma.user.create({
      data: { name: 'Admin', email: 'admin@test.dev', passwordHash, role: 'ADMIN' },
    }),
    app.prisma.user.create({
      data: { name: 'Manager', email: 'manager@test.dev', passwordHash, role: 'MANAGER' },
    }),
    app.prisma.user.create({
      data: { name: 'Viewer', email: 'viewer@test.dev', passwordHash, role: 'VIEWER' },
    }),
    app.prisma.user.create({
      data: {
        name: 'Disabled',
        email: 'disabled@test.dev',
        passwordHash,
        role: 'VIEWER',
        isActive: false,
      },
    }),
  ]);
  await app.prisma.s3Permission.createMany({
    data: [
      { userId: manager.id, bucket: 'example-bucket', prefix: 'client-a/' },
      { userId: viewer.id, bucket: 'example-bucket', prefix: 'client-a/' },
    ],
  });
  expect(admin.role).toBe('ADMIN');
  expect(disabled.isActive).toBe(false);
});

afterAll(async () => {
  s3Mock.restore();
  await app.close();
});

describe('authentication, cookies, CSRF, and CORS', () => {
  it('uses uniform login errors and does not expose password data', async () => {
    for (const payload of [
      { email: 'unknown@test.dev', password: 'WrongPassword1' },
      { email: 'viewer@test.dev', password: 'WrongPassword1' },
      { email: 'disabled@test.dev', password: 'Password1' },
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { origin: 'http://localhost:5173' },
        payload,
      });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' },
      });
      expect(response.body).not.toMatch(/passwordHash|WrongPassword|stack/i);
    }
  });

  it('sets protected cookies and stores only a token hash', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: 'http://localhost:5173' },
      payload: { email: 'viewer@test.dev', password: 'Password1' },
    });
    const session = setCookies(response);
    const sessionPair = session.cookie.split('; ').find((value) => value.startsWith('session_id='))!;
    const signedValue = decodeURIComponent(sessionPair.slice('session_id='.length));
    const unsigned = app.unsignCookie(signedValue);
    expect(unsigned.valid).toBe(true);
    const stored = await app.prisma.session.findUnique({
      where: { id: hashSessionToken(unsigned.value) },
    });
    expect(stored).not.toBeNull();
    expect(stored?.id).not.toBe(unsigned.value);

    const cookieHeaders = response.headers['set-cookie'];
    const rendered = Array.isArray(cookieHeaders) ? cookieHeaders.join('\n') : String(cookieHeaders);
    expect(rendered).toContain('HttpOnly');
    expect(rendered).toContain('SameSite=Lax');
  });

  it('rejects missing/mismatched CSRF and foreign origins', async () => {
    const session = await login('viewer@test.dev');
    const missing = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: authHeaders(session),
    });
    expect(missing.statusCode).toBe(403);

    const foreign = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { ...authHeaders(session, true), origin: 'https://evil.example' },
    });
    expect(foreign.statusCode).toBe(403);

    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: authHeaders(session, true),
    });
    expect(logout.statusCode).toBe(200);
    const reused = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: session.cookie },
    });
    expect(reused.statusCode).toBe(401);
  });

  it('allows only the configured CORS origin', async () => {
    const allowed = await app.inject({
      method: 'OPTIONS',
      url: '/api/auth/login',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'POST',
      },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const denied = await app.inject({
      method: 'OPTIONS',
      url: '/api/auth/login',
      headers: {
        origin: 'https://evil.example',
        'access-control-request-method': 'POST',
      },
    });
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('returns consistent rate-limit errors', async () => {
    let last;
    for (let index = 0; index < 11; index += 1) {
      last = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        remoteAddress: '198.51.100.20',
        headers: { origin: 'http://localhost:5173' },
        payload: { email: 'unknown@test.dev', password: 'WrongPassword1' },
      });
    }
    expect(last?.statusCode).toBe(429);
    expect(last?.json()).toEqual({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
      },
    });
  });

  it('sets no-store and browser security headers', async () => {
    const session = await login('viewer@test.dev');
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: session.cookie },
    });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('role and manager boundaries', () => {
  it('denies viewers and unauthenticated callers from management APIs', async () => {
    const viewer = await login('viewer@test.dev');
    expect((await app.inject({ method: 'GET', url: '/api/admin/users' })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/admin/users',
          headers: { cookie: viewer.cookie },
        })
      ).statusCode,
    ).toBe(403);
  });

  it('limits managers to viewers and denies audit access', async () => {
    const manager = await login('manager@test.dev');
    const users = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: { cookie: manager.cookie },
    });
    expect(users.statusCode).toBe(200);
    expect(users.json().items.every((user: { role: string }) => user.role === 'VIEWER')).toBe(true);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/admin/audit-logs',
          headers: { cookie: manager.cookie },
        })
      ).statusCode,
    ).toBe(403);

    const createAdmin = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      headers: authHeaders(manager, true),
      payload: {
        name: 'No',
        email: 'new-admin@test.dev',
        password: 'Password1',
        role: 'ADMIN',
      },
    });
    expect(createAdmin.statusCode).toBe(403);
  });

  it('prevents managers granting root or out-of-scope prefixes', async () => {
    const manager = await login('manager@test.dev');
    const viewer = await app.prisma.user.findUniqueOrThrow({ where: { email: 'viewer@test.dev' } });

    for (const prefix of ['', 'client-b/']) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/users/${viewer.id}/permissions`,
        headers: authHeaders(manager, true),
        payload: { bucket: 'example-bucket', prefix },
      });
      expect(response.statusCode).toBe(403);
    }

    const allowed = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${viewer.id}/permissions`,
      headers: authHeaders(manager, true),
      payload: { bucket: 'example-bucket', prefix: 'client-a/reports/' },
    });
    expect(allowed.statusCode).toBe(200);
  });

  it('allows admins to access audit logs', async () => {
    const admin = await login('admin@test.dev');
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/audit-logs',
      headers: { cookie: admin.cookie },
    });
    expect(response.statusCode).toBe(200);
  });
});

describe('S3 authorization, cursors, and error sanitization', () => {
  it('filters cross-tenant objects and binds pagination cursors', async () => {
    s3Mock.reset();
    s3Mock.on(ListObjectsV2Command).resolves({
      Contents: [
        { Key: 'client-a/report.pdf', Size: 3 * 1024 ** 3, LastModified: new Date() },
        { Key: 'client-b/secret.pdf', Size: 9, LastModified: new Date() },
      ],
      IsTruncated: true,
      NextContinuationToken: 'aws-secret-token',
    });
    const viewer = await login('viewer@test.dev');
    const first = await app.inject({
      method: 'GET',
      url: '/api/files?bucket=example-bucket&prefix=client-a/',
      headers: { cookie: viewer.cookie },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().files.map((file: { key: string }) => file.key)).toEqual([
      'client-a/report.pdf',
    ]);
    expect(first.json().files[0].size).toBe(3 * 1024 ** 3);
    expect(first.json().nextCursor).not.toContain('aws-secret-token');

    const replay = await app.inject({
      method: 'GET',
      url: `/api/files?bucket=example-bucket&prefix=client-a/other/&cursor=${encodeURIComponent(
        first.json().nextCursor,
      )}`,
      headers: { cookie: viewer.cookie },
    });
    expect(replay.statusCode).toBe(400);
  });

  it('never presigns unauthorized downloads and sanitizes AWS errors', async () => {
    s3Mock.reset();
    const viewer = await login('viewer@test.dev');
    const denied = await app.inject({
      method: 'GET',
      url: '/api/files/download?bucket=example-bucket&key=client-b/secret.pdf',
      headers: { cookie: viewer.cookie },
    });
    expect(denied.statusCode).toBe(403);
    expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(0);

    s3Mock.on(ListObjectsV2Command).rejects(
      new Error('AWS_SECRET_ACCESS_KEY=do-not-leak'),
    );
    const failed = await app.inject({
      method: 'GET',
      url: '/api/files?bucket=example-bucket&prefix=client-a/',
      headers: { cookie: viewer.cookie },
    });
    expect(failed.statusCode).toBe(500);
    expect(failed.body).not.toContain('do-not-leak');
  });
});

describe('trusted proxy HTTPS enforcement', () => {
  it('does not trust spoofed forwarded headers from untrusted peers', async () => {
    const saved = { ...process.env };
    Object.assign(process.env, {
      NODE_ENV: 'production',
      DATABASE_URL:
        'mysql://user:password@db.example.com:3306/file_portal?sslcert=/run/secrets/db-ca.pem&sslaccept=strict',
      COOKIE_SECURE: 'true',
      COOKIE_SECRET: 'p'.repeat(64),
      CURSOR_SECRET: 'q'.repeat(64),
      CORS_ORIGIN: 'https://files.example.com',
      PUBLIC_ORIGIN: 'https://files.example.com',
      TRUST_PROXY: '10.0.0.0/8',
      FORCE_HTTPS: 'true',
      ENABLE_API_DOCS: 'false',
    });
    const productionApp = await buildApp();
    await productionApp.ready();
    try {
      const spoofed = await productionApp.inject({
        method: 'GET',
        url: '/missing',
        remoteAddress: '203.0.113.10',
        headers: { 'x-forwarded-proto': 'https' },
      });
      expect(spoofed.statusCode).toBe(403);

      const trusted = await productionApp.inject({
        method: 'GET',
        url: '/missing',
        remoteAddress: '10.0.0.10',
        headers: { 'x-forwarded-proto': 'https' },
      });
      expect(trusted.statusCode).toBe(404);
      expect(
        await productionApp.inject({
          method: 'GET',
          url: '/docs',
          remoteAddress: '10.0.0.10',
          headers: { 'x-forwarded-proto': 'https' },
        }),
      ).toMatchObject({ statusCode: 404 });
    } finally {
      await productionApp.close();
      for (const key of Object.keys(process.env)) {
        if (!(key in saved)) delete process.env[key];
      }
      Object.assign(process.env, saved);
    }
  });
});
