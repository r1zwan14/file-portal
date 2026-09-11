import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import type { FastifyInstance } from 'fastify';
import type { AuthUser } from '../types/auth-user.js';
import { unauthorized } from '../utils/errors.js';
import { AuditService } from './audit.service.js';
import { hashSessionToken } from '../utils/session.js';

const dummyHashPromise = argon2.hash('not-a-real-user-password', {
  type: argon2.argon2id,
});

export class AuthService {
  private readonly audit: AuditService;

  constructor(private readonly app: FastifyInstance) {
    this.audit = new AuditService(app);
  }

  async login(
    email: string,
    password: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const user = await this.app.prisma.user.findUnique({ where: { email } });
    const passwordHash = user?.passwordHash ?? (await dummyHashPromise);
    const valid = await argon2.verify(passwordHash, password);
    if (!user || !user.isActive || !valid) {
      throw unauthorized('Invalid email or password');
    }

    const sessionId = randomBytes(32).toString('hex');
    const csrfToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(
      Date.now() + this.app.config.SESSION_EXPIRATION_HOURS * 60 * 60 * 1000,
    );

    await this.app.prisma.$transaction([
      this.app.prisma.session.deleteMany({ where: { expiresAt: { lte: new Date() } } }),
      this.app.prisma.session.create({
        data: {
          id: hashSessionToken(sessionId),
          userId: user.id,
          expiresAt,
        },
      }),
    ]);

    await this.audit.log({
      userId: user.id,
      action: 'LOGIN',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return {
      sessionId,
      csrfToken,
      maxAgeSeconds: this.app.config.SESSION_EXPIRATION_HOURS * 60 * 60,
      user: this.toAuthUser(user),
    };
  }

  async logout(
    sessionId: string,
    userId: number,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    await this.app.prisma.session.deleteMany({ where: { id: hashSessionToken(sessionId) } });
    await this.audit.log({
      userId,
      action: 'LOGOUT',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  async resolveSession(sessionId: string): Promise<AuthUser | null> {
    const session = await this.app.prisma.session.findUnique({
      where: { id: hashSessionToken(sessionId) },
      include: { user: true },
    });

    if (!session) return null;
    if (session.expiresAt.getTime() <= Date.now()) {
      await this.app.prisma.session
        .delete({ where: { id: hashSessionToken(sessionId) } })
        .catch(() => undefined);
      return null;
    }
    if (!session.user.isActive) return null;

    return this.toAuthUser(session.user);
  }

  async me(userId: number) {
    const user = await this.app.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { permissions: { orderBy: [{ bucket: 'asc' }, { prefix: 'asc' }] } },
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      permissions: user.permissions.map((p) => ({
        id: p.id,
        userId: p.userId,
        bucket: p.bucket,
        prefix: p.prefix,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
    };
  }

  private toAuthUser(user: {
    id: number;
    name: string;
    email: string;
    role: AuthUser['role'];
    isActive: boolean;
  }): AuthUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    };
  }
}
