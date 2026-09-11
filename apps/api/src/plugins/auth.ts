import fp from 'fastify-plugin';
import type { FastifyReply } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { forbidden } from '../utils/errors.js';
import { AuthService } from '../services/auth.service.js';
import {
  requireAuth,
  requireAdmin,
  requireManagerOrAdmin,
} from '../utils/roles.js';

const SESSION_COOKIE = 'session_id';
const CSRF_COOKIE = 'csrf_token';
const SECURE_SESSION_COOKIE = '__Host-session_id';
const SECURE_CSRF_COOKIE = '__Host-csrf_token';

export { SESSION_COOKIE, CSRF_COOKIE, requireAuth, requireAdmin, requireManagerOrAdmin };

export const authPlugin = fp(async (app) => {
  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);

  app.addHook('onRequest', async (request) => {
    const cookieName = app.config.COOKIE_SECURE ? SECURE_SESSION_COOKIE : SESSION_COOKIE;
    const signedSession = request.cookies[cookieName];
    const session = signedSession ? request.unsignCookie(signedSession) : null;
    if (!session?.valid) {
      request.user = null;
      request.sessionId = null;
      return;
    }

    const authService = new AuthService(app);
    const user = await authService.resolveSession(session.value);
    if (!user) {
      request.user = null;
      request.sessionId = null;
      return;
    }

    request.user = user;
    request.sessionId = session.value;
  });

  app.addHook('preHandler', async (request) => {
    const method = request.method.toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return;
    if (request.url.startsWith('/health') || request.url.startsWith('/docs')) return;
    const origin = request.headers.origin;
    const expectedOrigin = app.config.PUBLIC_ORIGIN ?? app.config.CORS_ORIGIN;
    if (
      (app.config.NODE_ENV === 'production' && !origin) ||
      (origin && origin !== expectedOrigin)
    ) {
      throw forbidden('Request origin is not allowed');
    }

    if (!request.user) return;

    const cookieName = app.config.COOKIE_SECURE ? SECURE_CSRF_COOKIE : CSRF_COOKIE;
    const csrfCookie = request.cookies[cookieName];
    const csrfHeader = request.headers['x-csrf-token'];
    const csrfSignature = csrfCookie ? request.unsignCookie(csrfCookie) : null;
    const cookieBuffer = Buffer.from(csrfCookie ?? '');
    const headerBuffer = Buffer.from(
      typeof csrfHeader === 'string' ? csrfHeader : '',
    );
    if (
      !csrfSignature?.valid ||
      cookieBuffer.length !== headerBuffer.length ||
      !timingSafeEqual(cookieBuffer, headerBuffer)
    ) {
      throw forbidden('CSRF token mismatch');
    }
  });
});

export function setSessionCookies(
  reply: FastifyReply,
  sessionId: string,
  csrfToken: string,
  maxAgeSeconds: number,
  secure: boolean,
) {
  const common = {
    path: '/',
    sameSite: 'lax' as const,
    secure,
    maxAge: maxAgeSeconds,
    signed: true,
  };

  const sessionCookie = secure ? SECURE_SESSION_COOKIE : SESSION_COOKIE;
  const csrfCookie = secure ? SECURE_CSRF_COOKIE : CSRF_COOKIE;
  reply.setCookie(sessionCookie, sessionId, {
    ...common,
    httpOnly: true,
  });

  reply.setCookie(csrfCookie, csrfToken, {
    ...common,
    httpOnly: false,
  });
}

export function clearSessionCookies(reply: FastifyReply, secure: boolean) {
  const sessionCookie = secure ? SECURE_SESSION_COOKIE : SESSION_COOKIE;
  const csrfCookie = secure ? SECURE_CSRF_COOKIE : CSRF_COOKIE;
  reply.clearCookie(sessionCookie, { path: '/', secure, sameSite: 'lax' });
  reply.clearCookie(csrfCookie, { path: '/', secure, sameSite: 'lax' });
}
