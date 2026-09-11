import type { UserRole } from '@portal/types';

export function canAccessAdminDashboard(role: UserRole) {
  return role === 'ADMIN';
}

export function canManageUsers(role: UserRole) {
  return role === 'ADMIN' || role === 'MANAGER';
}

export function canViewAuditLogs(role: UserRole) {
  return role === 'ADMIN';
}

export function homePathForRole(role: UserRole) {
  if (role === 'ADMIN') return '/admin';
  if (role === 'MANAGER') return '/admin/users';
  return '/files';
}

export function creatableRoles(actorRole: UserRole): UserRole[] {
  if (actorRole === 'ADMIN') return ['ADMIN', 'MANAGER', 'VIEWER'];
  if (actorRole === 'MANAGER') return ['VIEWER'];
  return [];
}
