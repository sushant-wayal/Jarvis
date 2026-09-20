import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    try {
      const { PrismaClient: TestPrismaClient } = require('./generated/test-client');
      return new TestPrismaClient({
        log: ['error'],
      }) as unknown as PrismaClient;
    } catch {
      // Fallback if generated test-client is not available
    }
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// In serverless environments (Vercel), store on globalThis to reuse across warm lambda invocations
globalForPrisma.prisma = prisma;


