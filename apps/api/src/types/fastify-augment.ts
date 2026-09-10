import 'fastify';
import type { AppConfig } from '@portal/config';
import type { PrismaClient } from '@prisma/client';
import type { AuthUser } from './auth-user.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
    prisma: PrismaClient;
  }

  interface FastifyRequest {
    user: AuthUser | null;
    sessionId: string | null;
  }
}
