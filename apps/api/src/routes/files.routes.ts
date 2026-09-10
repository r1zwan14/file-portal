import type { FastifyPluginAsync } from 'fastify';
import { downloadQuerySchema, listFilesQuerySchema } from '@portal/validation';
import { requireAuth } from '../plugins/auth.js';
import { S3Service } from '../services/s3.service.js';
import { AuthorizationService } from '../services/authorization.service.js';
import { getClientMeta, parseQuery } from '../utils/request.js';

export const filesRoutes: FastifyPluginAsync = async (app) => {
  const s3Service = new S3Service(app);
  const authz = new AuthorizationService(app);

  app.get('/', async (request) => {
    const user = requireAuth(request);
    const query = parseQuery(listFilesQuerySchema, request.query);
    const meta = getClientMeta(request);
    return s3Service.list(user, {
      bucket: query.bucket,
      prefix: query.prefix,
      cursor: query.cursor,
      search: query.search,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  });

  app.get('/download', async (request) => {
    const user = requireAuth(request);
    const query = parseQuery(downloadQuerySchema, request.query);
    const meta = getClientMeta(request);
    return s3Service.createDownloadUrl(user, {
      bucket: query.bucket,
      key: query.key,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  });

  app.get('/roots', async (request) => {
    const user = requireAuth(request);
    const permissions = await authz.resolveAccessiblePermissions(user);
    return { roots: s3Service.getRoots(user, permissions) };
  });

  app.get('/buckets', async (request) => {
    requireAuth(request);
    return { buckets: app.config.allowedBuckets };
  });
};
