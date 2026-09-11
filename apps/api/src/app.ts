import Fastify from 'fastify';
import { loadConfig } from '@portal/config';
import './types/fastify-augment.js';
import { registerPlugins } from './plugins/index.js';
import { registerRoutes } from './routes/index.js';
import { AppError } from './utils/errors.js';

export async function buildApp() {
  const config = loadConfig();
  const trustProxy = config.TRUST_PROXY
    ? config.TRUST_PROXY.split(',').map((entry) => entry.trim())
    : false;

  const app = Fastify({
    trustProxy,
    bodyLimit: config.BODY_LIMIT_BYTES,
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
      redact: {
        paths: [
          'req.headers.cookie',
          'req.headers.authorization',
          'req.headers.x-csrf-token',
          'password',
          'passwordHash',
          'sessionId',
          'csrfToken',
          'url',
          'DATABASE_URL',
          'AWS_ACCESS_KEY_ID',
          'AWS_SECRET_ACCESS_KEY',
        ],
        remove: true,
      },
      serializers: {
        req(request) {
          return {
            id: request.id,
            method: request.method,
            url: request.raw?.url?.split('?')[0],
            remoteAddress: request.ip,
          };
        },
      },
    },
    genReqId: () => crypto.randomUUID(),
    requestIdHeader: 'x-request-id',
  });

  app.decorate('config', config);

  app.setErrorHandler((error, request, reply) => {
    if (
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      error.statusCode === 429
    ) {
      return reply.status(429).send({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please try again later.',
        },
      });
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      });
    }

    if (typeof error === 'object' && error !== null && 'validation' in error) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: (error as { validation: unknown }).validation,
        },
      });
    }

    request.log.error(
      { errorName: error instanceof Error ? error.name : 'UnknownError' },
      'Unhandled error',
    );
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  });

  app.addHook('onRequest', async (request) => {
    if (
      config.FORCE_HTTPS &&
      request.protocol !== 'https' &&
      !request.url.startsWith('/health')
    ) {
      throw new AppError(403, 'FORBIDDEN', 'HTTPS is required');
    }
  });

  app.addHook('onSend', async (request, reply, payload) => {
    if (request.url.startsWith('/api/')) {
      reply.header('Cache-Control', 'no-store');
      reply.header('Pragma', 'no-cache');
    }
    return payload;
  });

  await registerPlugins(app);
  await registerRoutes(app);

  return app;
}
