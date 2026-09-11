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
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
  });

  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || origin === app.config.CORS_ORIGIN) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  });

  await app.register(cookie, {
    secret: app.config.COOKIE_SECRET,
    hook: 'onRequest',
  });

  await app.register(rateLimit, {
    global: true,
    max: app.config.GLOBAL_RATE_LIMIT_MAX,
    timeWindow: '1 minute',
    allowList: (request) => request.url.startsWith('/health'),
    errorResponseBuilder: () => ({
      statusCode: 429,
      code: 'RATE_LIMITED',
      error: 'Too Many Requests',
      message: 'Too many requests. Please try again later.',
    }),
  });

  if (app.config.ENABLE_API_DOCS && app.config.NODE_ENV !== 'production') {
    await app.register(swagger, {
      openapi: {
        info: {
          title: 'File Portal API',
          description:
            'Read-only S3 file portal for sharing files from an existing bucket with external clients.',
          version: '0.2.0',
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
  }

  await app.register(prismaPlugin);
  await app.register(authPlugin);
}
