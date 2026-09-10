import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import { prismaPlugin } from './prisma.js';
import { authPlugin } from './auth.js';

export async function registerPlugins(app: FastifyInstance) {
  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  await app.register(cors, {
    origin: app.config.CORS_ORIGIN,
    credentials: true,
  });

  await app.register(cookie, {
    secret: app.config.COOKIE_SECRET,
    hook: 'onRequest',
  });

  await app.register(rateLimit, {
    global: false,
    max: 100,
    timeWindow: '1 minute',
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Client S3 Portal API',
        description:
          'Read-only S3 file portal for internal teams to share files with external clients.',
        version: '1.0.0',
      },
      components: {
        securitySchemes: {
          cookieAuth: {
            type: 'apiKey',
            in: 'cookie',
            name: 'session_id',
          },
          csrfHeader: {
            type: 'apiKey',
            in: 'header',
            name: 'x-csrf-token',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });

  await app.register(prismaPlugin);
  await app.register(authPlugin);
}
