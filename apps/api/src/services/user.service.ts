import argon2 from 'argon2';
import type { FastifyInstance } from 'fastify';
import type { Prisma, Role } from '@prisma/client';
import { conflict, forbidden, notFound, validationError } from '../utils/errors.js';
import type { AuthUser } from '../types/auth-user.js';
import { assertManagerCanManageTarget } from '../utils/roles.js';
import { normalizePrefix } from '../utils/s3-path.js';
import { AuditService } from './audit.service.js';

function toUserPublic(user: {
  id: number;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  permissions?: Array<{
    id: number;
    userId: number;
    bucket: string;
    prefix: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    permissions: (user.permissions ?? []).map((p) => ({
      id: p.id,
      userId: p.userId,
      bucket: p.bucket,
      prefix: p.prefix,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
  };
}

export class UserService {
  private readonly audit: AuditService;

  constructor(private readonly app: FastifyInstance) {
    this.audit = new AuditService(app);
  }

  async list(actor: AuthUser, params: { page: number; pageSize: number; q?: string }) {
    const where: Prisma.UserWhereInput = {};

    // Managers only see viewer accounts they are allowed to manage.
    if (actor.role === 'MANAGER') {
      where.role = 'VIEWER';
    }

    if (params.q) {
      where.AND = [
        {
          OR: [{ name: { contains: params.q } }, { email: { contains: params.q } }],
        },
      ];
    }

    const [total, users] = await Promise.all([
      this.app.prisma.user.count({ where }),
      this.app.prisma.user.findMany({
        where,
        include: { permissions: true },
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
    ]);

    return {
      items: users.map(toUserPublic),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  async getById(actor: AuthUser, id: number) {
    const user = await this.app.prisma.user.findUnique({
      where: { id },
      include: { permissions: { orderBy: [{ bucket: 'asc' }, { prefix: 'asc' }] } },
    });
    if (!user) throw notFound('User not found');
    assertManagerCanManageTarget(actor, user.role);
    return toUserPublic(user);
  }

  async create(
    actor: AuthUser,
    input: {
      name: string;
      email: string;
      password: string;
      role: Role;
      isActive?: boolean;
    },
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    if (actor.role === 'MANAGER') {
      if (input.role !== 'VIEWER') {
        throw forbidden('Managers can only create viewer users.');
      }
    }

    const existing = await this.app.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw conflict('Email is already in use');

    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    const user = await this.app.prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        role: input.role,
        isActive: input.isActive ?? true,
      },
      include: { permissions: true },
    });

    await this.audit.log({
      userId: actor.id,
      action: 'CREATE_USER',
      objectKey: String(user.id),
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return toUserPublic(user);
  }

  async update(
    actor: AuthUser,
    id: number,
    input: {
      name?: string;
      email?: string;
      role?: Role;
      isActive?: boolean;
    },
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const user = await this.app.prisma.user.findUnique({ where: { id } });
    if (!user) throw notFound('User not found');
    assertManagerCanManageTarget(actor, user.role);

    if (actor.role === 'MANAGER') {
      if (input.role && input.role !== 'VIEWER') {
        throw forbidden('Managers cannot change a user role away from VIEWER.');
      }
    }

    if (input.email && input.email !== user.email) {
      const existing = await this.app.prisma.user.findUnique({ where: { email: input.email } });
      if (existing) throw conflict('Email is already in use');
    }

    const updated = await this.app.prisma.user.update({
      where: { id },
      data: {
        name: input.name,
        email: input.email,
        role: input.role,
        isActive: input.isActive,
      },
      include: { permissions: true },
    });

    if (input.isActive === false) {
      await this.app.prisma.session.deleteMany({ where: { userId: id } });
    }
    if (input.role && input.role !== user.role) {
      await this.app.prisma.session.deleteMany({ where: { userId: id } });
    }

    await this.audit.log({
      userId: actor.id,
      action: 'UPDATE_USER',
      objectKey: String(id),
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return toUserPublic(updated);
  }

  async disable(
    actor: AuthUser,
    id: number,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    if (id === actor.id) throw validationError('You cannot disable your own account');
    const existing = await this.ensureUser(id);
    assertManagerCanManageTarget(actor, existing.role);

    const user = await this.app.prisma.user.update({
      where: { id },
      data: { isActive: false },
      include: { permissions: true },
    });
    await this.app.prisma.session.deleteMany({ where: { userId: id } });
    await this.audit.log({
      userId: actor.id,
      action: 'DISABLE_USER',
      objectKey: String(id),
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return toUserPublic(user);
  }

  async enable(
    actor: AuthUser,
    id: number,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await this.ensureUser(id);
    assertManagerCanManageTarget(actor, existing.role);

    const user = await this.app.prisma.user.update({
      where: { id },
      data: { isActive: true },
      include: { permissions: true },
    });
    await this.audit.log({
      userId: actor.id,
      action: 'ENABLE_USER',
      objectKey: String(id),
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return toUserPublic(user);
  }

  async delete(
    actor: AuthUser,
    id: number,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    if (id === actor.id) throw validationError('You cannot delete your own account');
    const existing = await this.ensureUser(id);
    assertManagerCanManageTarget(actor, existing.role);

    if (actor.role === 'MANAGER' && existing.role !== 'VIEWER') {
      throw forbidden('Managers can only delete viewer users.');
    }

    await this.app.prisma.user.delete({ where: { id } });
    await this.audit.log({
      userId: actor.id,
      action: 'DELETE_USER',
      objectKey: String(id),
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return { ok: true };
  }

  async resetPassword(
    actor: AuthUser,
    id: number,
    password: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await this.ensureUser(id);
    assertManagerCanManageTarget(actor, existing.role);

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await this.app.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });
    await this.app.prisma.session.deleteMany({ where: { userId: id } });
    await this.audit.log({
      userId: actor.id,
      action: 'PASSWORD_RESET',
      objectKey: String(id),
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return { ok: true };
  }

  async listPermissions(actor: AuthUser, userId: number) {
    const user = await this.ensureUser(userId);
    assertManagerCanManageTarget(actor, user.role);
    const permissions = await this.app.prisma.s3Permission.findMany({
      where: { userId },
      orderBy: [{ bucket: 'asc' }, { prefix: 'asc' }],
    });
    return permissions.map((p) => ({
      id: p.id,
      userId: p.userId,
      bucket: p.bucket,
      prefix: p.prefix,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));
  }

  async addPermission(
    actor: AuthUser,
    userId: number,
    input: { bucket: string; prefix: string },
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const user = await this.ensureUser(userId);
    assertManagerCanManageTarget(actor, user.role);
    await this.assertCanGrantPermission(actor, input.bucket, input.prefix);
    if (!this.app.config.allowedBuckets.includes(input.bucket)) {
      throw validationError('Bucket is not in the allowed buckets list');
    }

    try {
      const permission = await this.app.prisma.s3Permission.create({
        data: {
          userId,
          bucket: input.bucket,
          prefix: input.prefix,
        },
      });
      await this.app.prisma.session.deleteMany({ where: { userId } });

      await this.audit.log({
        userId: actor.id,
        action: 'ADD_PERMISSION',
        bucket: input.bucket,
        objectKey: input.prefix,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      return {
        id: permission.id,
        userId: permission.userId,
        bucket: permission.bucket,
        prefix: permission.prefix,
        createdAt: permission.createdAt.toISOString(),
        updatedAt: permission.updatedAt.toISOString(),
      };
    } catch {
      throw conflict('Permission already exists for this bucket/prefix');
    }
  }

  async removePermission(
    actor: AuthUser,
    userId: number,
    permissionId: number,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const user = await this.ensureUser(userId);
    assertManagerCanManageTarget(actor, user.role);

    const permission = await this.app.prisma.s3Permission.findFirst({
      where: { id: permissionId, userId },
    });
    if (!permission) throw notFound('Permission not found');

    await this.app.prisma.s3Permission.delete({ where: { id: permissionId } });
    await this.app.prisma.session.deleteMany({ where: { userId } });
    await this.audit.log({
      userId: actor.id,
      action: 'REMOVE_PERMISSION',
      bucket: permission.bucket,
      objectKey: permission.prefix,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return { ok: true };
  }

  private async ensureUser(id: number) {
    const user = await this.app.prisma.user.findUnique({ where: { id } });
    if (!user) throw notFound('User not found');
    return user;
  }

  private async assertCanGrantPermission(
    actor: AuthUser,
    bucket: string,
    prefix: string,
  ) {
    if (actor.role === 'ADMIN') return;

    const requested = normalizePrefix(prefix);
    if (!requested) {
      throw forbidden('Managers cannot grant bucket-root access.');
    }

    const permissions = await this.app.prisma.s3Permission.findMany({
      where: { userId: actor.id, bucket },
      select: { prefix: true },
    });
    const contained = permissions.some((permission) => {
      const allowed = normalizePrefix(permission.prefix);
      return Boolean(allowed) && requested.startsWith(allowed);
    });
    if (!contained) {
      throw forbidden('Managers may only grant access within their own S3 permissions.');
    }
  }
}
