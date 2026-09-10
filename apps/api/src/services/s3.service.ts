import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
  type _Object,
  type CommonPrefix,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { FastifyInstance } from 'fastify';
import type { AuthUser } from '../types/auth-user.js';
import { fileNameFromKey, folderNameFromPrefix, normalizePrefix } from '../utils/s3-path.js';
import { AppError } from '../utils/errors.js';
import { AuthorizationService } from './authorization.service.js';
import { AuditService } from './audit.service.js';

export class S3Service {
  private readonly client: S3Client;
  private readonly authz: AuthorizationService;
  private readonly audit: AuditService;

  constructor(private readonly app: FastifyInstance) {
    const credentials =
      app.config.AWS_ACCESS_KEY_ID && app.config.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: app.config.AWS_ACCESS_KEY_ID,
            secretAccessKey: app.config.AWS_SECRET_ACCESS_KEY,
          }
        : undefined;

    this.client = new S3Client({
      region: app.config.AWS_REGION,
      ...(credentials ? { credentials } : {}),
    });
    this.authz = new AuthorizationService(app);
    this.audit = new AuditService(app);
  }

  async list(
    user: AuthUser,
    input: {
      bucket?: string;
      prefix?: string;
      cursor?: string;
      search?: string;
      ipAddress?: string | null;
      userAgent?: string | null;
    },
  ) {
    const permissions = await this.authz.resolveAccessiblePermissions(user);
    if (permissions.length === 0) {
      return {
        bucket: this.app.config.allowedBuckets[0] ?? '',
        currentPrefix: '',
        folders: [],
        files: [],
        nextCursor: null,
        isTruncated: false,
      };
    }

    const bucket = this.authz.resolveDefaultBucket(permissions, input.bucket);
    const prefix = normalizePrefix(input.prefix ?? '');

    await this.authz.requirePrefixAccess(user, bucket, prefix);

    if (input.search) {
      return this.search(user, bucket, prefix, input.search, permissions);
    }

    try {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          Delimiter: '/',
          ContinuationToken: input.cursor,
          MaxKeys: 200,
        }),
      );

      const folders = (response.CommonPrefixes ?? [])
        .map((entry: CommonPrefix) => entry.Prefix)
        .filter((p): p is string => Boolean(p))
        .map((folderPrefix) => ({
          name: folderNameFromPrefix(folderPrefix),
          prefix: folderPrefix,
        }));

      const files = (response.Contents ?? [])
        .filter((obj: _Object) => obj.Key && obj.Key !== prefix)
        .map((obj: _Object) => ({
          key: obj.Key!,
          name: fileNameFromKey(obj.Key!),
          size: obj.Size ?? 0,
          lastModified: (obj.LastModified ?? new Date()).toISOString(),
        }));

      const filtered = this.authz.filterListResultForPermissions(
        permissions,
        bucket,
        prefix,
        folders,
        files,
      );

      await this.audit.log({
        userId: user.id,
        action: 'LIST',
        bucket,
        objectKey: prefix || null,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });

      return {
        bucket,
        currentPrefix: prefix,
        folders: filtered.folders,
        files: filtered.files,
        nextCursor: response.IsTruncated ? (response.NextContinuationToken ?? null) : null,
        isTruncated: Boolean(response.IsTruncated),
      };
    } catch (error) {
      this.app.log.error({ err: error }, 'S3 list failed');
      throw new AppError(500, 'INTERNAL_ERROR', 'Failed to list files from storage');
    }
  }

  private async search(
    user: AuthUser,
    bucket: string,
    rootPrefix: string,
    query: string,
    permissions: Awaited<ReturnType<AuthorizationService['resolveAccessiblePermissions']>>,
  ) {
    const needle = query.toLowerCase();
    const searchRoots = permissions
      .filter((p) => p.bucket === bucket)
      .map((p) => normalizePrefix(p.prefix))
      .filter((p) => {
        if (!rootPrefix) return true;
        return p.startsWith(rootPrefix) || rootPrefix.startsWith(p) || !p;
      })
      .map((p) => (rootPrefix && rootPrefix.startsWith(p) ? rootPrefix : p || rootPrefix));

    const uniqueRoots = [...new Set(searchRoots.length ? searchRoots : [rootPrefix])];
    const matchedFiles: Array<{
      key: string;
      name: string;
      size: number;
      lastModified: string;
    }> = [];

    for (const searchPrefix of uniqueRoots) {
      let token: string | undefined;
      do {
        const response = await this.client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: searchPrefix,
            ContinuationToken: token,
            MaxKeys: 1000,
          }),
        );

        for (const obj of response.Contents ?? []) {
          if (!obj.Key || obj.Key.endsWith('/')) continue;
          if (!this.authz.canAccessObject(permissions, bucket, obj.Key)) continue;
          const name = fileNameFromKey(obj.Key);
          if (!name.toLowerCase().includes(needle) && !obj.Key.toLowerCase().includes(needle)) {
            continue;
          }
          matchedFiles.push({
            key: obj.Key,
            name,
            size: obj.Size ?? 0,
            lastModified: (obj.LastModified ?? new Date()).toISOString(),
          });
          if (matchedFiles.length >= 200) break;
        }

        token = response.IsTruncated ? response.NextContinuationToken : undefined;
      } while (token && matchedFiles.length < 200);
    }

    await this.audit.log({
      userId: user.id,
      action: 'LIST',
      bucket,
      objectKey: rootPrefix || null,
    });

    return {
      bucket,
      currentPrefix: rootPrefix,
      folders: [],
      files: matchedFiles,
      nextCursor: null,
      isTruncated: false,
    };
  }

  async createDownloadUrl(
    user: AuthUser,
    input: {
      bucket?: string;
      key: string;
      ipAddress?: string | null;
      userAgent?: string | null;
    },
  ) {
    const permissions = await this.authz.resolveAccessiblePermissions(user);
    const bucket = this.authz.resolveDefaultBucket(permissions, input.bucket);
    await this.authz.requireObjectAccess(user, bucket, input.key);

    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: input.key,
        ResponseContentDisposition: `attachment; filename="${fileNameFromKey(input.key)}"`,
      });

      const url = await getSignedUrl(this.client, command, {
        expiresIn: this.app.config.S3_PRESIGNED_URL_EXPIRATION,
      });

      await this.audit.log({
        userId: user.id,
        action: 'DOWNLOAD',
        bucket,
        objectKey: input.key,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });

      return { url };
    } catch (error) {
      this.app.log.error({ err: error }, 'Failed to create download URL');
      throw new AppError(500, 'INTERNAL_ERROR', 'Failed to generate download URL');
    }
  }

  getRoots(user: AuthUser, permissions: Awaited<ReturnType<AuthorizationService['resolveAccessiblePermissions']>>) {
    if (user.role === 'ADMIN') {
      return this.app.config.allowedBuckets.map((bucket) => ({
        bucket,
        prefix: '',
        label: bucket,
      }));
    }

    return permissions.map((p) => ({
      bucket: p.bucket,
      prefix: p.prefix,
      label: p.prefix ? folderNameFromPrefix(p.prefix) : p.bucket,
    }));
  }
}
