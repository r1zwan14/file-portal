import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  AWS_REGION: z.string().min(1),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  S3_ALLOWED_BUCKETS: z.string().min(1),
  S3_PRESIGNED_URL_EXPIRATION: z.coerce.number().int().positive().default(300),
  SESSION_EXPIRATION_HOURS: z.coerce.number().int().positive().default(24),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  COOKIE_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().url(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
  SEED_VIEWER_PASSWORD: z.string().optional(),
});

export type AppConfig = z.infer<typeof envSchema> & {
  allowedBuckets: string[];
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  const data = parsed.data;
  const allowedBuckets = data.S3_ALLOWED_BUCKETS.split(',')
    .map((b) => b.trim())
    .filter(Boolean);

  if (allowedBuckets.length === 0) {
    throw new Error('S3_ALLOWED_BUCKETS must contain at least one bucket');
  }

  return {
    ...data,
    allowedBuckets,
  };
}
