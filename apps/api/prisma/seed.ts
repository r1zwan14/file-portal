import argon2 from 'argon2';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const viewerPassword = process.env.SEED_VIEWER_PASSWORD ?? 'ChangeMe1';

  if (!adminPassword) {
    throw new Error('SEED_ADMIN_PASSWORD is required to seed the database');
  }

  const adminHash = await argon2.hash(adminPassword, { type: argon2.argon2id });
  const viewerHash = await argon2.hash(viewerPassword, { type: argon2.argon2id });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {
      name: 'Portal Admin',
      passwordHash: adminHash,
      role: Role.ADMIN,
      isActive: true,
    },
    create: {
      name: 'Portal Admin',
      email: 'admin@example.com',
      passwordHash: adminHash,
      role: Role.ADMIN,
      isActive: true,
    },
  });

  const viewer = await prisma.user.upsert({
    where: { email: 'client-a@example.com' },
    update: {
      name: 'Client A',
      passwordHash: viewerHash,
      role: Role.VIEWER,
      isActive: true,
    },
    create: {
      name: 'Client A',
      email: 'client-a@example.com',
      passwordHash: viewerHash,
      role: Role.VIEWER,
      isActive: true,
    },
  });

  const defaultBucket = process.env.S3_ALLOWED_BUCKETS?.split(',')[0]?.trim();

  if (defaultBucket) {
    await prisma.s3Permission.upsert({
      where: {
        userId_bucket_prefix: {
          userId: viewer.id,
          bucket: defaultBucket,
          prefix: 'client-a/',
        },
      },
      update: {},
      create: {
        userId: viewer.id,
        bucket: defaultBucket,
        prefix: 'client-a/',
      },
    });
    console.log(`Seeded viewer permission bucket=${defaultBucket} prefix=client-a/`);
  } else {
    console.log('S3_ALLOWED_BUCKETS not set; skipped viewer S3 permission seed');
  }

  console.log(`Seeded admin user id=${admin.id} email=${admin.email}`);
  console.log(`Seeded viewer user id=${viewer.id} email=${viewer.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
