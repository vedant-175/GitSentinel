import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    'postgresql://postgres:postgres@127.0.0.1:5433/ai_code_review?schema=public';
}

export const prisma =
  globalThis.prismaGlobal ??
  new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma;
}

export * from '@prisma/client';

/**
 * Utility to convert Prisma models containing BigInt fields to plain JSON-safe objects.
 */
export function serializeWithBigInt<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_, value) =>
      typeof value === 'bigint' ? value.toString() : value
    )
  );
}

let dbAvailableCache: Promise<boolean> | null = null;

export async function isDatabaseAvailable(): Promise<boolean> {
  if (dbAvailableCache !== null) return dbAvailableCache;
  dbAvailableCache = (async () => {
    try {
      await prisma.$executeRawUnsafe('SELECT 1');
      return true;
    } catch {
      return false;
    }
  })();
  return dbAvailableCache;
}
