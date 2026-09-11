import type { AuthUser } from '../types/auth-user.js';
import { unauthorized, forbidden } from '../utils/errors.js';
import type { FastifyRequest } from 'fastify';

export type AppRole = 'ADMIN' | 'MANAGER' | 'VIEWER';

export function requireAuth(request: FastifyRequest) {
  if (!request.user || !request.sessionId) {
    throw unauthorized();
  }
  if (!request.user.isActive) {
    throw unauthorized('Account is disabled');
  }
  return request.user;
}

export function requireAdmin(request: FastifyRequest) {
  const user = requireAuth(request);
  if (user.role !== 'ADMIN') {
    throw forbidden();
  }
  return user;
}

export function requireManagerOrAdmin(request: FastifyRequest) {
  const user = requireAuth(request);
  if (user.role !== 'ADMIN' && user.role !== 'MANAGER') {
    throw forbidden();
  }
  return user;
}

export function isAdmin(user: AuthUser) {
  return user.role === 'ADMIN';
}

export function isManager(user: AuthUser) {
  return user.role === 'MANAGER';
}

export function canManageUsers(user: AuthUser) {
  return user.role === 'ADMIN' || user.role === 'MANAGER';
}

/** Managers may only manage VIEWER accounts. */
export function assertManagerCanManageTarget(actor: AuthUser, targetRole: AppRole) {
  if (actor.role === 'MANAGER' && targetRole !== 'VIEWER') {
    throw forbidden('Managers can only manage viewer users.');
  }
}
