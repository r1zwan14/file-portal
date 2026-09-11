export type UserRole = 'ADMIN' | 'MANAGER' | 'VIEWER';

export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'DOWNLOAD'
  | 'LIST'
  | 'CREATE_USER'
  | 'UPDATE_USER'
  | 'DISABLE_USER'
  | 'ENABLE_USER'
  | 'DELETE_USER'
  | 'PASSWORD_RESET'
  | 'ADD_PERMISSION'
  | 'REMOVE_PERMISSION';

export interface ApiErrorBody {
  error: {
    code:
      | 'UNAUTHORIZED'
      | 'FORBIDDEN'
      | 'NOT_FOUND'
      | 'VALIDATION_ERROR'
      | 'CONFLICT'
      | 'RATE_LIMITED'
      | 'INTERNAL_ERROR';
    message: string;
    details?: unknown;
  };
}

export interface UserPublic {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface S3PermissionPublic {
  id: number;
  userId: number;
  bucket: string;
  prefix: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthMeResponse {
  user: UserPublic;
  permissions: S3PermissionPublic[];
}

export interface FolderItem {
  name: string;
  prefix: string;
}

export interface FileItem {
  key: string;
  name: string;
  size: number;
  lastModified: string;
}

export interface FileListResponse {
  bucket: string;
  currentPrefix: string;
  folders: FolderItem[];
  files: FileItem[];
  nextCursor: string | null;
  isTruncated: boolean;
}

export interface DownloadResponse {
  url: string;
}

export interface AuditLogPublic {
  id: number;
  userId: number | null;
  userEmail: string | null;
  userName: string | null;
  action: AuditAction;
  bucket: string | null;
  objectKey: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
