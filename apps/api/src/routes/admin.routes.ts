import type { FastifyPluginAsync } from 'fastify';
import {
  createPermissionSchema,
  createUserSchema,
  paginationQuerySchema,
  resetPasswordSchema,
  updateUserSchema,
  type PaginationQuery,
} from '@portal/validation';
import { requireAdmin, requireManagerOrAdmin } from '../plugins/auth.js';
import { UserService } from '../services/user.service.js';
import { AuditService } from '../services/audit.service.js';
import { getClientMeta, parseBody, parseQuery } from '../utils/request.js';
import { validationError } from '../utils/errors.js';

export const adminRoutes: FastifyPluginAsync = async (app) => {
  const userService = new UserService(app);
  const auditService = new AuditService(app);

  app.get('/users', async (request) => {
    const actor = requireManagerOrAdmin(request);
    const query = parseQuery(paginationQuerySchema, request.query) as PaginationQuery;
    return userService.list(actor, query);
  });

  app.post('/users', async (request) => {
    const actor = requireManagerOrAdmin(request);
    const body = parseBody(createUserSchema, request.body);
    const meta = getClientMeta(request);
    return userService.create(actor, body, meta);
  });

  app.get('/users/:id', async (request) => {
    const actor = requireManagerOrAdmin(request);
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || id < 1) throw validationError('Invalid user id');
    return userService.getById(actor, id);
  });

  app.patch('/users/:id', async (request) => {
    const actor = requireManagerOrAdmin(request);
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || id < 1) throw validationError('Invalid user id');
    const body = parseBody(updateUserSchema, request.body);
    const meta = getClientMeta(request);
    return userService.update(actor, id, body, meta);
  });

  app.delete('/users/:id', async (request) => {
    const actor = requireManagerOrAdmin(request);
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || id < 1) throw validationError('Invalid user id');
    const meta = getClientMeta(request);
    return userService.delete(actor, id, meta);
  });

  app.post('/users/:id/reset-password', async (request) => {
    const actor = requireManagerOrAdmin(request);
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || id < 1) throw validationError('Invalid user id');
    const body = parseBody(resetPasswordSchema, request.body);
    const meta = getClientMeta(request);
    return userService.resetPassword(actor, id, body.password, meta);
  });

  app.post('/users/:id/disable', async (request) => {
    const actor = requireManagerOrAdmin(request);
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || id < 1) throw validationError('Invalid user id');
    const meta = getClientMeta(request);
    return userService.disable(actor, id, meta);
  });

  app.post('/users/:id/enable', async (request) => {
    const actor = requireManagerOrAdmin(request);
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || id < 1) throw validationError('Invalid user id');
    const meta = getClientMeta(request);
    return userService.enable(actor, id, meta);
  });

  app.get('/users/:id/permissions', async (request) => {
    const actor = requireManagerOrAdmin(request);
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || id < 1) throw validationError('Invalid user id');
    return { items: await userService.listPermissions(actor, id) };
  });

  app.post('/users/:id/permissions', async (request) => {
    const actor = requireManagerOrAdmin(request);
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || id < 1) throw validationError('Invalid user id');
    const body = parseBody(createPermissionSchema, request.body);
    const meta = getClientMeta(request);
    return userService.addPermission(actor, id, body, meta);
  });

  app.delete('/users/:id/permissions/:permissionId', async (request) => {
    const actor = requireManagerOrAdmin(request);
    const params = request.params as { id: string; permissionId: string };
    const id = Number(params.id);
    const permissionId = Number(params.permissionId);
    if (!Number.isInteger(id) || id < 1) throw validationError('Invalid user id');
    if (!Number.isInteger(permissionId) || permissionId < 1) {
      throw validationError('Invalid permission id');
    }
    const meta = getClientMeta(request);
    return userService.removePermission(actor, id, permissionId, meta);
  });

  app.get('/audit-logs', async (request) => {
    requireAdmin(request);
    const query = parseQuery(paginationQuerySchema, request.query) as PaginationQuery;
    return auditService.list(query);
  });

  app.get('/config/buckets', async (request) => {
    requireManagerOrAdmin(request);
    return { buckets: app.config.allowedBuckets };
  });
};
