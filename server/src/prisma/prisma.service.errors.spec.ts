import { PrismaService } from './prisma.service';

// Keep the error/sanitization code real; no client construction may read .env
// or establish a connection in the default test suite.
jest.mock('@prisma/client', () => ({
  PrismaClient: class {
    $connect = jest.fn();
    $disconnect = jest.fn().mockResolvedValue(undefined);
  },
}));

describe('PrismaService connection errors', () => {
  it('throws a clear error without leaking credentials when connect fails', async () => {
    const prisma = new PrismaService();
    jest
      .spyOn(prisma, '$connect')
      .mockRejectedValue(
        new Error(
          'postgresql://secret_user:super_secret_password@127.0.0.1:1/no_such_db',
        ),
      );

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
