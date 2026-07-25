import { PrismaService } from './prisma.service';

describe('PrismaService connection errors', () => {
  const originalUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalUrl;
  });

  it('throws a clear error without leaking credentials when connect fails', async () => {
    process.env.DATABASE_URL =
      'postgresql://secret_user:super_secret_password@127.0.0.1:1/no_such_db';

    const prisma = new PrismaService();

    await expect(prisma.onModuleInit()).rejects.toThrow(
      /Failed to connect to the database\. Verify DATABASE_URL without exposing credentials\./,
    );

    try {
      await prisma.onModuleInit();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain('super_secret_password');
      expect(message).not.toContain('secret_user');
    } finally {
      await prisma.$disconnect().catch(() => undefined);
    }
  });
});
