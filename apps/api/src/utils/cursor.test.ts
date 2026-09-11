import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from './cursor.js';

const secret = 'cursor-test-secret-that-is-long-enough';

describe('signed pagination cursors', () => {
  it('round-trips only for the bound bucket and prefix', () => {
    const cursor = encodeCursor(
      { bucket: 'example-bucket', prefix: 'client-a/', token: 'opaque-token' },
      secret,
    );
    expect(
      decodeCursor(
        cursor,
        { bucket: 'example-bucket', prefix: 'client-a/' },
        secret,
      ),
    ).toBe('opaque-token');
    expect(() =>
      decodeCursor(
        cursor,
        { bucket: 'example-bucket', prefix: 'client-b/' },
        secret,
      ),
    ).toThrow();
  });

  it('rejects tampering', () => {
    const cursor = encodeCursor(
      { bucket: 'example-bucket', prefix: 'client-a/', token: 'opaque-token' },
      secret,
    );
    expect(() =>
      decodeCursor(`${cursor.slice(0, -1)}x`, { bucket: 'example-bucket', prefix: 'client-a/' }, secret),
    ).toThrow();
  });
});
