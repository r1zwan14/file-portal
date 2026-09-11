import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  AWS_REGION: z.string().min(1),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  S3_ALLOWED_BUCKETS: z.string().min(1),
  S3_PRESIGNED_URL_EXPIRATION: z.coerce.number().int().min(60).max(3600).default(300),
  SESSION_EXPIRATION_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  COOKIE_SECRET: z.string().min(32),
  CURSOR_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().url(),
  PUBLIC_ORIGIN: z.string().url().optional(),
  TRUST_PROXY: z.string().optional(),
  FORCE_HTTPS: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  ENABLE_API_DOCS: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  GLOBAL_RATE_LIMIT_MAX: z.coerce.number().int().min(10).max(10000).default(300),
  BODY_LIMIT_BYTES: z.coerce.number().int().min(1024).max(1048576).default(131072),
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

  const hasAccessKey = Boolean(data.AWS_ACCESS_KEY_ID);
  const hasSecretKey = Boolean(data.AWS_SECRET_ACCESS_KEY);
  if (hasAccessKey !== hasSecretKey) {
    throw new Error('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set together');
  }

  if (data.NODE_ENV === 'production') {
    if (!data.COOKIE_SECURE) {
      throw new Error('COOKIE_SECURE must be true in production');
    }
    if (!data.FORCE_HTTPS) {
      throw new Error('FORCE_HTTPS must be true in production');
    }
    if (!data.PUBLIC_ORIGIN || !data.PUBLIC_ORIGIN.startsWith('https://')) {
      throw new Error('PUBLIC_ORIGIN must be an HTTPS URL in production');
    }
    if (data.CORS_ORIGIN !== data.PUBLIC_ORIGIN) {
      throw new Error('CORS_ORIGIN must exactly match PUBLIC_ORIGIN in production');
    }
    if (!data.TRUST_PROXY) {
      throw new Error('TRUST_PROXY must contain trusted proxy IPs/CIDRs in production');
    }
    if (data.TRUST_PROXY === 'true' || /^\d+$/.test(data.TRUST_PROXY)) {
      throw new Error('TRUST_PROXY must use explicit IP addresses or CIDR ranges');
    }
    if (data.COOKIE_SECRET.length < 48 || data.CURSOR_SECRET.length < 48) {
      throw new Error('Production secrets must be at least 48 characters');
    }
    if (/change-me|replace-me/i.test(`${data.COOKIE_SECRET}${data.CURSOR_SECRET}`)) {
      throw new Error('Placeholder secrets are not allowed in production');
    }
    const databaseUrl = new URL(data.DATABASE_URL);
    if (
      databaseUrl.searchParams.get('sslaccept') !== 'strict' ||
      !databaseUrl.searchParams.get('sslcert')
    ) {
      throw new Error(
        'Production DATABASE_URL must include sslcert and sslaccept=strict',
      );
    }
  }

  return {
    ...data,
    allowedBuckets,
  };
}
