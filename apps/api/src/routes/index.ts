import type { FastifyInstance } from 'fastify';
import { authRoutes } from './auth.routes.js';
import { filesRoutes } from './files.routes.js';
import { adminRoutes } from './admin.routes.js';
import { healthRoutes } from './health.routes.js';

export async function registerRoutes(app: FastifyInstance) {
  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(filesRoutes, { prefix: '/api/files' });
  await app.register(adminRoutes, { prefix: '/api/admin' });
}
