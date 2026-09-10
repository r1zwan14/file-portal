import { z } from 'zod';

export const emailSchema = z.string().trim().email().max(255);

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const roleSchema = z.enum(['ADMIN', 'VIEWER']);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const createUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  password: passwordSchema,
  role: roleSchema,
  isActive: z.boolean().optional().default(true),
});

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    email: emailSchema.optional(),
    role: roleSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const resetPasswordSchema = z.object({
  password: passwordSchema,
});

const bucketNameSchema = z
  .string()
  .trim()
  .min(3)
  .max(63)
  .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/, 'Invalid bucket name');

export const s3KeySchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine((key) => !key.includes('..'), 'Path traversal is not allowed')
  .refine((key) => !key.startsWith('/'), 'S3 keys must not start with /')
  .refine((key) => !key.includes('\\'), 'Invalid S3 key');

export const s3PrefixSchema = z
  .string()
  .trim()
  .max(512)
  .refine((prefix) => !prefix.includes('..'), 'Path traversal is not allowed')
  .refine((prefix) => !prefix.startsWith('/'), 'Prefixes must not start with /')
  .refine((prefix) => !prefix.includes('\\'), 'Invalid prefix')
  .transform((prefix) => {
    if (!prefix) return '';
    return prefix.endsWith('/') ? prefix : `${prefix}/`;
  });

export const createPermissionSchema = z.object({
  bucket: bucketNameSchema,
  prefix: s3PrefixSchema,
});

export const listFilesQuerySchema = z.object({
  bucket: bucketNameSchema.optional(),
  prefix: z.string().trim().max(1024).optional().default(''),
  cursor: z.string().trim().max(2048).optional(),
  search: z.string().trim().max(200).optional(),
});

export const downloadQuerySchema = z.object({
  bucket: bucketNameSchema.optional(),
  key: s3KeySchema,
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  q: z.string().trim().max(200).optional(),
  action: z.string().trim().max(50).optional(),
  userId: z.coerce.number().int().positive().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type CreatePermissionInput = z.infer<typeof createPermissionSchema>;
export type ListFilesQuery = z.infer<typeof listFilesQuerySchema>;
export type DownloadQuery = z.infer<typeof downloadQuerySchema>;
export type PaginationQuery = z.output<typeof paginationQuerySchema>;
