import argon2 from 'argon2';
import { PrismaClient, Role } from '@prisma/client';
import { z } from 'zod';

const inputSchema = z.object({
  INITIAL_ADMIN_EMAIL: z.string().email(),
  INITIAL_ADMIN_PASSWORD: z
    .string()
    .min(12)
    .max(128)
    .regex(/[a-z]/)
    .regex(/[A-Z]/)
    .regex(/[0-9]/),
  INITIAL_ADMIN_NAME: z.string().trim().min(1).max(120).default('Administrator'),
});

async function main() {
  const input = inputSchema.parse(process.env);
  const prisma = new PrismaClient();

  try {
    const existingAdmin = await prisma.user.findFirst({ where: { role: Role.ADMIN } });
    if (existingAdmin) {
      console.log('An administrator already exists; bootstrap made no changes.');
      return;
    }

    const existingEmail = await prisma.user.findUnique({
      where: { email: input.INITIAL_ADMIN_EMAIL },
    });
    if (existingEmail) {
      throw new Error('Bootstrap email already belongs to a non-admin user');
    }

    const passwordHash = await argon2.hash(input.INITIAL_ADMIN_PASSWORD, {
      type: argon2.argon2id,
    });
    await prisma.user.create({
      data: {
        name: input.INITIAL_ADMIN_NAME,
        email: input.INITIAL_ADMIN_EMAIL,
        passwordHash,
        role: Role.ADMIN,
        isActive: true,
      },
    });
    console.log('Initial administrator created. Remove bootstrap credentials now.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Admin bootstrap failed');
  process.exit(1);
});
