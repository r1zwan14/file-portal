import type {
  ApiErrorBody,
  AuthMeResponse,
  DownloadResponse,
  FileListResponse,
  PaginatedResponse,
  S3PermissionPublic,
  UserPublic,
  AuditLogPublic,
} from '@portal/types';
import { getCsrfToken } from '../utils';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const method = (init.method ?? 'GET').toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrf = getCsrfToken();
    if (csrf) headers.set('x-csrf-token', csrf);
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const data = (await response.json().catch(() => null)) as T | ApiErrorBody | null;

  if (!response.ok) {
    const err = data as ApiErrorBody | null;
    throw new ApiError(
      response.status,
      err?.error?.code ?? 'INTERNAL_ERROR',
      err?.error?.message ?? 'Request failed',
      err?.error?.details,
    );
  }

  return data as T;
}

export const api = {
  login(email: string, password: string) {
    return request<AuthMeResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },
  logout() {
    return request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
  },
  me() {
    return request<AuthMeResponse>('/api/auth/me');
  },
  listFiles(params: {
    bucket?: string;
    prefix?: string;
    cursor?: string;
    search?: string;
  }) {
    const qs = new URLSearchParams();
    if (params.bucket) qs.set('bucket', params.bucket);
    if (params.prefix) qs.set('prefix', params.prefix);
    if (params.cursor) qs.set('cursor', params.cursor);
    if (params.search) qs.set('search', params.search);
    return request<FileListResponse>(`/api/files?${qs.toString()}`);
  },
  download(params: { bucket?: string; key: string }) {
    const qs = new URLSearchParams({ key: params.key });
    if (params.bucket) qs.set('bucket', params.bucket);
    return request<DownloadResponse>(`/api/files/download?${qs.toString()}`);
  },
  fileRoots() {
    return request<{
      roots: Array<{ bucket: string; prefix: string; label: string }>;
    }>('/api/files/roots');
  },
  listUsers(params: { page?: number; pageSize?: number; q?: string } = {}) {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    if (params.q) qs.set('q', params.q);
    return request<PaginatedResponse<UserPublic & { permissions: S3PermissionPublic[] }>>(
      `/api/admin/users?${qs.toString()}`,
    );
  },
  getUser(id: number) {
    return request<UserPublic & { permissions: S3PermissionPublic[] }>(`/api/admin/users/${id}`);
  },
  createUser(body: {
    name: string;
    email: string;
    password: string;
    role: 'ADMIN' | 'VIEWER';
    isActive?: boolean;
  }) {
    return request<UserPublic>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  updateUser(
    id: number,
    body: Partial<{ name: string; email: string; role: 'ADMIN' | 'VIEWER'; isActive: boolean }>,
  ) {
    return request<UserPublic>(`/api/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },
  disableUser(id: number) {
    return request<UserPublic>(`/api/admin/users/${id}/disable`, { method: 'POST' });
  },
  enableUser(id: number) {
    return request<UserPublic>(`/api/admin/users/${id}/enable`, { method: 'POST' });
  },
  resetPassword(id: number, password: string) {
    return request<{ ok: boolean }>(`/api/admin/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  },
  listPermissions(userId: number) {
    return request<{ items: S3PermissionPublic[] }>(`/api/admin/users/${userId}/permissions`);
  },
  addPermission(userId: number, body: { bucket: string; prefix: string }) {
    return request<S3PermissionPublic>(`/api/admin/users/${userId}/permissions`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  removePermission(userId: number, permissionId: number) {
    return request<{ ok: boolean }>(
      `/api/admin/users/${userId}/permissions/${permissionId}`,
      { method: 'DELETE' },
    );
  },
  listAuditLogs(params: {
    page?: number;
    pageSize?: number;
    q?: string;
    action?: string;
  } = {}) {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    if (params.q) qs.set('q', params.q);
    if (params.action) qs.set('action', params.action);
    return request<PaginatedResponse<AuditLogPublic>>(`/api/admin/audit-logs?${qs.toString()}`);
  },
  allowedBuckets() {
    return request<{ buckets: string[] }>('/api/admin/config/buckets');
  },
};
