import type { FastifyPluginAsync } from 'fastify';
import { loginSchema } from '@portal/validation';
import { AuthService } from '../services/auth.service.js';
import {
  clearSessionCookies,
  requireAuth,
  setSessionCookies,
} from '../plugins/auth.js';
import { getClientMeta, parseBody } from '../utils/request.js';

export const authRoutes: FastifyPluginAsync = async (app) => {
  const authService = new AuthService(app);

  app.post(
    '/login',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const body = parseBody(loginSchema, request.body);
      const meta = getClientMeta(request);
      const result = await authService.login(body.email, body.password, meta);

      setSessionCookies(
        reply,
        result.sessionId,
        result.csrfToken,
        result.maxAgeSeconds,
        app.config.COOKIE_SECURE,
      );

      const me = await authService.me(result.user.id);
      return me;
    },
  );

  app.post('/logout', async (request, reply) => {
    const user = requireAuth(request);
    const meta = getClientMeta(request);
    await authService.logout(request.sessionId!, user.id, meta);
    clearSessionCookies(reply, app.config.COOKIE_SECURE);
    return { ok: true };
  });

  app.get('/me', async (request) => {
    const user = requireAuth(request);
    return authService.me(user.id);
  });
};
