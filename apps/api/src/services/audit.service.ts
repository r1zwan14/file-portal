import type { FastifyInstance } from 'fastify';
import type { AuditAction, Prisma } from '@prisma/client';

export class AuditService {
  constructor(private readonly app: FastifyInstance) {}

  async log(input: {
    userId?: number | null;
    action: AuditAction;
    bucket?: string | null;
    objectKey?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }) {
    await this.app.prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        bucket: input.bucket ?? null,
        objectKey: input.objectKey ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ? input.userAgent.slice(0, 512) : null,
      },
    });
  }

  async list(params: {
    page: number;
    pageSize: number;
    action?: string;
    userId?: number;
    q?: string;
  }) {
    const where: Prisma.AuditLogWhereInput = {};

    if (params.action) {
      where.action = params.action as AuditAction;
    }
    if (params.userId) {
      where.userId = params.userId;
    }
    if (params.q) {
      where.OR = [
        { objectKey: { contains: params.q } },
        { bucket: { contains: params.q } },
        { user: { email: { contains: params.q } } },
        { user: { name: { contains: params.q } } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.app.prisma.auditLog.count({ where }),
      this.app.prisma.auditLog.findMany({
        where,
        include: { user: { select: { email: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        userEmail: row.user?.email ?? null,
        userName: row.user?.name ?? null,
        action: row.action,
        bucket: row.bucket,
        objectKey: row.objectKey,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }
}
