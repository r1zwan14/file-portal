import { PrismaClient } from '@prisma/client';
import fp from 'fastify-plugin';

export const prismaPlugin = fp(async (app) => {
  const prisma = new PrismaClient({
    log: app.config.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

  app.decorate('prisma', prisma);

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
});
