import { describe, expect, it } from 'vitest';
import { canAccessObject, canListPrefix } from '../services/authorization.service.js';

const EXAMPLE_BUCKET = 'example-bucket';
const clientA = [{ bucket: EXAMPLE_BUCKET, prefix: 'client-a/' }];

describe('authorization canAccessObject', () => {
  it('allows client-a keys under client-a/', () => {
    expect(canAccessObject(clientA, EXAMPLE_BUCKET, 'client-a/file.pdf')).toBe(true);
    expect(canAccessObject(clientA, EXAMPLE_BUCKET, 'client-a/docs/file.pdf')).toBe(true);
    expect(canAccessObject(clientA, EXAMPLE_BUCKET, 'client-a/docs/a.pdf')).toBe(true);
  });

  it('denies client-b and internal keys', () => {
    expect(canAccessObject(clientA, EXAMPLE_BUCKET, 'client-b/file.pdf')).toBe(false);
    expect(canAccessObject(clientA, EXAMPLE_BUCKET, 'internal/file.pdf')).toBe(false);
    expect(canAccessObject(clientA, EXAMPLE_BUCKET, 'client-ab/file.pdf')).toBe(false);
    expect(canAccessObject(clientA, EXAMPLE_BUCKET, 'client-a-extra/file.pdf')).toBe(false);
  });

  it('denies other buckets', () => {
    expect(canAccessObject(clientA, 'other-bucket', 'client-a/file.pdf')).toBe(false);
  });

  it('denies path traversal attempts', () => {
    expect(canAccessObject(clientA, EXAMPLE_BUCKET, 'client-a/../client-b/file.pdf')).toBe(false);
  });
});

describe('authorization canListPrefix', () => {
  it('allows listing within and above permitted prefix', () => {
    expect(canListPrefix(clientA, EXAMPLE_BUCKET, 'client-a/')).toBe(true);
    expect(canListPrefix(clientA, EXAMPLE_BUCKET, 'client-a/docs/')).toBe(true);
    expect(canListPrefix(clientA, EXAMPLE_BUCKET, '')).toBe(true);
  });

  it('denies listing unrelated prefixes', () => {
    expect(canListPrefix(clientA, EXAMPLE_BUCKET, 'client-b/')).toBe(false);
    expect(canListPrefix(clientA, EXAMPLE_BUCKET, 'internal/')).toBe(false);
  });
});

describe('admin-style empty prefix', () => {
  const admin = [{ bucket: EXAMPLE_BUCKET, prefix: '' }];

  it('allows any key in the bucket', () => {
    expect(canAccessObject(admin, EXAMPLE_BUCKET, 'internal/file.pdf')).toBe(true);
    expect(canAccessObject(admin, EXAMPLE_BUCKET, 'client-b/file.pdf')).toBe(true);
  });
});
