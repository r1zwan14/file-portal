import argon2 from 'argon2';
import type { FastifyInstance } from 'fastify';
import type { Prisma, Role } from '@prisma/client';
import { conflict, notFound, validationError } from '../utils/errors.js';
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

  async list(params: { page: number; pageSize: number; q?: string }) {
    const where: Prisma.UserWhereInput = params.q
      ? {
          OR: [
            { name: { contains: params.q } },
            { email: { contains: params.q } },
          ],
        }
      : {};

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

  async getById(id: number) {
    const user = await this.app.prisma.user.findUnique({
      where: { id },
      include: { permissions: { orderBy: [{ bucket: 'asc' }, { prefix: 'asc' }] } },
    });
    if (!user) throw notFound('User not found');
    return toUserPublic(user);
  }

  async create(
    input: {
      name: string;
      email: string;
      password: string;
      role: Role;
      isActive?: boolean;
    },
    actorId: number,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
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
      userId: actorId,
      action: 'CREATE_USER',
      objectKey: String(user.id),
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return toUserPublic(user);
  }

  async update(
    id: number,
    input: {
      name?: string;
      email?: string;
      role?: Role;
      isActive?: boolean;
    },
    actorId: number,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const user = await this.app.prisma.user.findUnique({ where: { id } });
    if (!user) throw notFound('User not found');

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

    await this.audit.log({
      userId: actorId,
      action: 'UPDATE_USER',
      objectKey: String(id),
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return toUserPublic(updated);
  }

  async disable(
    id: number,
    actorId: number,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    if (id === actorId) throw validationError('You cannot disable your own account');
    const user = await this.app.prisma.user.update({
      where: { id },
      data: { isActive: false },
      include: { permissions: true },
    });
    await this.app.prisma.session.deleteMany({ where: { userId: id } });
    await this.audit.log({
      userId: actorId,
      action: 'DISABLE_USER',
      objectKey: String(id),
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return toUserPublic(user);
  }

  async enable(
    id: number,
    actorId: number,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const user = await this.app.prisma.user.update({
      where: { id },
      data: { isActive: true },
      include: { permissions: true },
    });
    await this.audit.log({
      userId: actorId,
      action: 'ENABLE_USER',
      objectKey: String(id),
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return toUserPublic(user);
  }

  async resetPassword(
    id: number,
    password: string,
    actorId: number,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await this.app.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });
    await this.app.prisma.session.deleteMany({ where: { userId: id } });
    await this.audit.log({
      userId: actorId,
      action: 'PASSWORD_RESET',
      objectKey: String(id),
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return { ok: true };
  }

  async listPermissions(userId: number) {
    await this.ensureUser(userId);
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
    userId: number,
    input: { bucket: string; prefix: string },
    actorId: number,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    await this.ensureUser(userId);
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

      await this.audit.log({
        userId: actorId,
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
    userId: number,
    permissionId: number,
    actorId: number,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const permission = await this.app.prisma.s3Permission.findFirst({
      where: { id: permissionId, userId },
    });
    if (!permission) throw notFound('Permission not found');

    await this.app.prisma.s3Permission.delete({ where: { id: permissionId } });
    await this.audit.log({
      userId: actorId,
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
}
