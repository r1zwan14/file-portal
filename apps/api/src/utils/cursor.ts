import { createHmac, timingSafeEqual } from 'node:crypto';
import { validationError } from './errors.js';

interface CursorPayload {
  bucket: string;
  prefix: string;
  token: string;
}

export function encodeCursor(payload: CursorPayload, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function decodeCursor(
  cursor: string,
  expected: Pick<CursorPayload, 'bucket' | 'prefix'>,
  secret: string,
): string {
  const [encoded, signature, extra] = cursor.split('.');
  if (!encoded || !signature || extra) throw validationError('Invalid pagination cursor');

  const expectedSignature = createHmac('sha256', secret).update(encoded).digest();
  let receivedSignature: Buffer;
  try {
    receivedSignature = Buffer.from(signature, 'base64url');
  } catch {
    throw validationError('Invalid pagination cursor');
  }
  if (
    receivedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(receivedSignature, expectedSignature)
  ) {
    throw validationError('Invalid pagination cursor');
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as CursorPayload;
    if (
      payload.bucket !== expected.bucket ||
      payload.prefix !== expected.prefix ||
      typeof payload.token !== 'string'
    ) {
      throw new Error('mismatch');
    }
    return payload.token;
  } catch {
    throw validationError('Pagination cursor does not match this folder');
  }
}
