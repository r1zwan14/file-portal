import type { FastifyInstance } from 'fastify';
import type { S3Permission } from '@prisma/client';
import type { AuthUser } from '../types/auth-user.js';
import {
  canListWithinPermission,
  isKeyWithinPrefix,
  normalizeKey,
  normalizePrefix,
} from '../utils/s3-path.js';
import { forbidden, validationError } from '../utils/errors.js';

export type PermissionLike = Pick<S3Permission, 'bucket' | 'prefix'>;

export class AuthorizationService {
  constructor(private readonly app: FastifyInstance) {}

  async getUserPermissions(userId: number): Promise<PermissionLike[]> {
    return this.app.prisma.s3Permission.findMany({
      where: { userId },
      select: { bucket: true, prefix: true },
    });
  }

  /**
   * Admins can access any configured allowed bucket.
   * Viewers are limited to their assigned permissions.
   */
  async resolveAccessiblePermissions(user: AuthUser): Promise<PermissionLike[]> {
    if (user.role === 'ADMIN') {
      return this.app.config.allowedBuckets.map((bucket) => ({
        bucket,
        prefix: '',
      }));
    }
    return this.getUserPermissions(user.id);
  }

  assertBucketAllowed(bucket: string) {
    if (!this.app.config.allowedBuckets.includes(bucket)) {
      throw forbidden('Bucket is not configured for this application');
    }
  }

  canAccessObject(permissions: PermissionLike[], bucket: string, key: string): boolean {
    let normalizedKey: string;
    try {
      normalizedKey = normalizeKey(key);
    } catch {
      return false;
    }

    return permissions.some(
      (permission) =>
        permission.bucket === bucket && isKeyWithinPrefix(normalizedKey, permission.prefix),
    );
  }

  canListPrefix(permissions: PermissionLike[], bucket: string, prefix: string): boolean {
    let normalizedPrefix: string;
    try {
      normalizedPrefix = normalizePrefix(prefix);
    } catch {
      return false;
    }

    return permissions.some(
      (permission) =>
        permission.bucket === bucket && canListWithinPermission(normalizedPrefix, permission.prefix),
    );
  }

  filterListResultForPermissions(
    permissions: PermissionLike[],
    bucket: string,
    currentPrefix: string,
    folders: Array<{ name: string; prefix: string }>,
    files: Array<{ key: string; name: string; size: number; lastModified: string }>,
  ) {
    const bucketPermissions = permissions.filter((p) => p.bucket === bucket);
    const normalizedCurrent = normalizePrefix(currentPrefix);

    const visibleFolders = folders.filter((folder) => {
      return bucketPermissions.some((permission) => {
        const allowed = normalizePrefix(permission.prefix);
        if (!allowed) return true;
        // Show folder if it is within allowed prefix, or is an ancestor leading to it.
        return (
          folder.prefix.startsWith(allowed) ||
          allowed.startsWith(folder.prefix) ||
          (normalizedCurrent === '' && allowed.startsWith(folder.prefix))
        );
      });
    });

    const visibleFiles = files.filter((file) => this.canAccessObject(bucketPermissions, bucket, file.key));

    return { folders: visibleFolders, files: visibleFiles };
  }

  async requireObjectAccess(user: AuthUser, bucket: string, key: string) {
    this.assertBucketAllowed(bucket);
    const permissions = await this.resolveAccessiblePermissions(user);
    if (!this.canAccessObject(permissions, bucket, key)) {
      throw forbidden('You do not have access to this object.');
    }
    return permissions;
  }

  async requirePrefixAccess(user: AuthUser, bucket: string, prefix: string) {
    this.assertBucketAllowed(bucket);
    let normalized: string;
    try {
      normalized = normalizePrefix(prefix);
    } catch {
      throw validationError('Invalid prefix');
    }

    const permissions = await this.resolveAccessiblePermissions(user);
    if (!this.canListPrefix(permissions, bucket, normalized)) {
      throw forbidden('You do not have access to this folder.');
    }
    return permissions;
  }

  resolveDefaultBucket(permissions: PermissionLike[], requested?: string): string {
    if (requested) {
      this.assertBucketAllowed(requested);
      if (!permissions.some((p) => p.bucket === requested)) {
        throw forbidden('You do not have access to this bucket.');
      }
      return requested;
    }

    const first = permissions[0]?.bucket ?? this.app.config.allowedBuckets[0];
    if (!first) {
      throw forbidden('No S3 buckets are configured.');
    }
    return first;
  }
}

/** Pure helpers exported for unit tests without Fastify. */
export function canAccessObject(
  userPermissions: PermissionLike[],
  bucket: string,
  key: string,
): boolean {
  try {
    const normalizedKey = normalizeKey(key);
    return userPermissions.some(
      (permission) =>
        permission.bucket === bucket && isKeyWithinPrefix(normalizedKey, permission.prefix),
    );
  } catch {
    return false;
  }
}

export function canListPrefix(
  userPermissions: PermissionLike[],
  bucket: string,
  prefix: string,
): boolean {
  try {
    const normalizedPrefix = normalizePrefix(prefix);
    return userPermissions.some(
      (permission) =>
        permission.bucket === bucket &&
        canListWithinPermission(normalizedPrefix, permission.prefix),
    );
  } catch {
    return false;
  }
}
