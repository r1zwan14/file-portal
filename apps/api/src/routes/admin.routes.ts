import type { FastifyPluginAsync } from 'fastify';
import {
  createPermissionSchema,
  createUserSchema,
  paginationQuerySchema,
  resetPasswordSchema,
  updateUserSchema,
  type PaginationQuery,
} from '@portal/validation';
import { requireAdmin } from '../plugins/auth.js';
import { UserService } from '../services/user.service.js';
import { AuditService } from '../services/audit.service.js';
import { getClientMeta, parseBody, parseQuery } from '../utils/request.js';
import { validationError } from '../utils/errors.js';

export const adminRoutes: FastifyPluginAsync = async (app) => {
  const userService = new UserService(app);
  const auditService = new AuditService(app);

  app.addHook('preHandler', async (request) => {
    requireAdmin(request);
  });

  app.get('/users', async (request) => {
    const query = parseQuery(paginationQuerySchema, request.query) as PaginationQuery;
    return userService.list(query);
  });

  app.post('/users', async (request) => {
    const body = parseBody(createUserSchema, request.body);
    const meta = getClientMeta(request);
    return userService.create(body, request.user!.id, meta);
  });

  app.get('/users/:id', async (request) => {
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || id < 1) throw validationError('Invalid user id');
    return userService.getById(id);
  });

  app.patch('/users/:id', async (request) => {
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || id < 1) throw validationError('Invalid user id');
    const body = parseBody(updateUserSchema, request.body);
    const meta = getClientMeta(request);
    return userService.update(id, body, request.user!.id, meta);
  });

  app.post('/users/:id/reset-password', async (request) => {
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || id < 1) throw validationError('Invalid user id');
    const body = parseBody(resetPasswordSchema, request.body);
    const meta = getClientMeta(request);
    return userService.resetPassword(id, body.password, request.user!.id, meta);
  });

  app.post('/users/:id/disable', async (request) => {
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || id < 1) throw validationError('Invalid user id');
    const meta = getClientMeta(request);
    return userService.disable(id, request.user!.id, meta);
  });

  app.post('/users/:id/enable', async (request) => {
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || id < 1) throw validationError('Invalid user id');
    const meta = getClientMeta(request);
    return userService.enable(id, request.user!.id, meta);
  });

  app.get('/users/:id/permissions', async (request) => {
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || id < 1) throw validationError('Invalid user id');
    return { items: await userService.listPermissions(id) };
  });

  app.post('/users/:id/permissions', async (request) => {
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || id < 1) throw validationError('Invalid user id');
    const body = parseBody(createPermissionSchema, request.body);
    const meta = getClientMeta(request);
    return userService.addPermission(id, body, request.user!.id, meta);
  });

  app.delete('/users/:id/permissions/:permissionId', async (request) => {
    const params = request.params as { id: string; permissionId: string };
    const id = Number(params.id);
    const permissionId = Number(params.permissionId);
    if (!Number.isInteger(id) || id < 1) throw validationError('Invalid user id');
    if (!Number.isInteger(permissionId) || permissionId < 1) {
      throw validationError('Invalid permission id');
    }
    const meta = getClientMeta(request);
    return userService.removePermission(id, permissionId, request.user!.id, meta);
  });

  app.get('/audit-logs', async (request) => {
    const query = parseQuery(paginationQuerySchema, request.query) as PaginationQuery;
    return auditService.list(query);
  });

  app.get('/config/buckets', async () => {
    return { buckets: app.config.allowedBuckets };
  });
};
