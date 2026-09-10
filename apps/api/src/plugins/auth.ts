import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { unauthorized, forbidden } from '../utils/errors.js';
import { AuthService } from '../services/auth.service.js';

const SESSION_COOKIE = 'session_id';
const CSRF_COOKIE = 'csrf_token';

export { SESSION_COOKIE, CSRF_COOKIE };

export const authPlugin = fp(async (app) => {
  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);

  app.addHook('onRequest', async (request) => {
    const sessionId = request.cookies[SESSION_COOKIE];
    if (!sessionId) {
      request.user = null;
      request.sessionId = null;
      return;
    }

    const authService = new AuthService(app);
    const user = await authService.resolveSession(sessionId);
    if (!user) {
      request.user = null;
      request.sessionId = null;
      return;
    }

    request.user = user;
    request.sessionId = sessionId;
  });

  // CSRF: double-submit cookie pattern for state-changing methods.
  app.addHook('preHandler', async (request) => {
    const method = request.method.toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return;
    if (request.url.startsWith('/health') || request.url.startsWith('/docs')) return;
    // Login establishes cookies; CSRF enforced after authentication exists.
    if (request.url === '/api/auth/login') return;

    if (!request.user) return;

    const csrfCookie = request.cookies[CSRF_COOKIE];
    const csrfHeader = request.headers['x-csrf-token'];
    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      throw forbidden('CSRF token mismatch');
    }
  });
});

export function requireAuth(request: FastifyRequest) {
  if (!request.user || !request.sessionId) {
    throw unauthorized();
  }
  if (!request.user.isActive) {
    throw unauthorized('Account is disabled');
  }
  return request.user;
}

export function requireAdmin(request: FastifyRequest) {
  const user = requireAuth(request);
  if (user.role !== 'ADMIN') {
    throw forbidden();
  }
  return user;
}

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
  };

  reply.setCookie(SESSION_COOKIE, sessionId, {
    ...common,
    httpOnly: true,
  });

  reply.setCookie(CSRF_COOKIE, csrfToken, {
    ...common,
    httpOnly: false,
  });
}

export function clearSessionCookies(reply: FastifyReply, secure: boolean) {
  reply.clearCookie(SESSION_COOKIE, { path: '/', secure, sameSite: 'lax' });
  reply.clearCookie(CSRF_COOKIE, { path: '/', secure, sameSite: 'lax' });
}
