process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'mysql://portal_test:portal_test@127.0.0.1:3307/file_portal_test';
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_ACCESS_KEY_ID = 'test-access-key';
process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key';
process.env.S3_ALLOWED_BUCKETS = 'example-bucket';
process.env.S3_PRESIGNED_URL_EXPIRATION = '300';
process.env.SESSION_EXPIRATION_HOURS = '24';
process.env.COOKIE_SECURE = 'false';
process.env.COOKIE_SECRET = 'security-test-cookie-secret-at-least-32-characters';
process.env.CURSOR_SECRET = 'security-test-cursor-secret-at-least-32-characters';
process.env.CORS_ORIGIN = 'http://localhost:5173';
process.env.PUBLIC_ORIGIN = 'http://localhost:5173';
process.env.FORCE_HTTPS = 'false';
process.env.ENABLE_API_DOCS = 'true';
process.env.GLOBAL_RATE_LIMIT_MAX = '10000';
process.env.BODY_LIMIT_BYTES = '131072';
