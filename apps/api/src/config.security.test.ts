import { describe, expect, it } from 'vitest';
import { loadConfig } from '@portal/config';

const secureProductionEnv = {
  NODE_ENV: 'production',
  PORT: '4000',
  DATABASE_URL:
    'mysql://user:password@db.example.com:3306/file_portal?sslcert=/run/secrets/db-ca.pem&sslaccept=strict',
  AWS_REGION: 'us-east-1',
  S3_ALLOWED_BUCKETS: 'example-bucket',
  S3_PRESIGNED_URL_EXPIRATION: '300',
  SESSION_EXPIRATION_HOURS: '24',
  COOKIE_SECURE: 'true',
  COOKIE_SECRET: 'a'.repeat(64),
  CURSOR_SECRET: 'b'.repeat(64),
  CORS_ORIGIN: 'https://files.example.com',
  PUBLIC_ORIGIN: 'https://files.example.com',
  TRUST_PROXY: '172.16.0.0/12',
  FORCE_HTTPS: 'true',
  ENABLE_API_DOCS: 'false',
};

describe('production configuration', () => {
  it('accepts a hardened production configuration', () => {
    expect(loadConfig(secureProductionEnv).NODE_ENV).toBe('production');
  });

  it.each([
    ['insecure cookies', { COOKIE_SECURE: 'false' }],
    ['HTTP public origin', { PUBLIC_ORIGIN: 'http://files.example.com' }],
    ['wildcard-like mismatched CORS', { CORS_ORIGIN: 'https://other.example.com' }],
    ['missing proxy allowlist', { TRUST_PROXY: '' }],
    ['numeric proxy trust', { TRUST_PROXY: '1' }],
    ['weak cookie secret', { COOKIE_SECRET: 'short-secret' }],
    ['non-strict database TLS', { DATABASE_URL: 'mysql://user:pass@db/db' }],
    ['excessive session TTL', { SESSION_EXPIRATION_HOURS: '1000' }],
  ])('rejects %s', (_name, override) => {
    expect(() => loadConfig({ ...secureProductionEnv, ...override })).toThrow();
  });

  it('requires AWS static credentials as a pair', () => {
    expect(() =>
      loadConfig({ ...secureProductionEnv, AWS_ACCESS_KEY_ID: 'only-one-half' }),
    ).toThrow(/must be set together/);
  });
});
