import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { resolveIsolatedDatabaseUrl } from './testing/isolated-database';

const TEST_EMAILS = [
  'unique@example.com',
  'rt@example.com',
  'cascade@example.com',
];

const testDatabaseUrl = resolveIsolatedDatabaseUrl(process.env);
process.env.DATABASE_URL = testDatabaseUrl;

describe('PrismaService foundation', () => {
  let prisma: PrismaService;

  async function removeTestFixtures(): Promise<void> {
    await prisma.user.deleteMany({
      where: { email: { in: TEST_EMAILS } },
    });
  }

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    prisma = module.get(PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await removeTestFixtures();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await removeTestFixtures();
  });

  it('enforces unique User.email', async () => {
    await prisma.user.create({
      data: {
        email: 'unique@example.com',
        name: 'Alice',
        passwordHash: 'hash-1',
      },
    });

    await expect(
      prisma.user.create({
        data: {
          email: 'unique@example.com',
          name: 'Bob',
          passwordHash: 'hash-2',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('enforces unique RefreshToken.tokenHash', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'rt@example.com',
        name: 'RT User',
        passwordHash: 'hash',
      },
    });

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: 'same-hash',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await expect(
      prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: 'same-hash',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('cascades RefreshToken deletion when User is deleted', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'cascade@example.com',
        name: 'Cascade',
        passwordHash: 'hash',
        refreshTokens: {
          create: {
            tokenHash: 'cascade-hash',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        },
      },
      include: { refreshTokens: true },
    });

    expect(user.refreshTokens).toHaveLength(1);

    await prisma.user.delete({ where: { id: user.id } });

    const remaining = await prisma.refreshToken.findMany({
      where: { tokenHash: 'cascade-hash' },
    });
    expect(remaining).toHaveLength(0);
  });

  it('stores passwordHash and tokenHash, not plaintext password or refreshToken fields', () => {
    const userFields = Object.values(Prisma.UserScalarFieldEnum);
    const refreshFields = Object.values(Prisma.RefreshTokenScalarFieldEnum);

    expect(userFields).toContain('passwordHash');
    expect(userFields).not.toContain('password');
    expect(refreshFields).toContain('tokenHash');
    expect(refreshFields).not.toContain('token');
    expect(refreshFields).not.toContain('refreshToken');
  });
});
