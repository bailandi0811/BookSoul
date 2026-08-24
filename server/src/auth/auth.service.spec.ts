import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { compare, getRounds, hash } from 'bcryptjs';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  interface RefreshTokenWrite {
    data: {
      userId: string;
      tokenHash: string;
      expiresAt: Date;
    };
  }

  const user: User = {
    id: 'user-1',
    email: 'reader@example.com',
    name: 'Reader',
    passwordHash: '',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  let usersService: {
    findByEmail: jest.Mock;
    create: jest.Mock;
  };
  let prisma: {
    refreshToken: {
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let transaction: {
    refreshToken: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let jwtService: {
    signAsync: jest.Mock;
  };
  let service: AuthService;
  let refreshTokenWrite: RefreshTokenWrite | undefined;
  let storedPasswordHash: string | undefined;

  beforeEach(() => {
    refreshTokenWrite = undefined;
    storedPasswordHash = undefined;
    usersService = {
      findByEmail: jest.fn(),
      create: jest.fn(),
    };
    prisma = {
      refreshToken: {
        create: jest.fn((input: RefreshTokenWrite) => {
          refreshTokenWrite = input;
          return Promise.resolve({});
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    };
    transaction = {
      refreshToken: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    jwtService = {
      signAsync: jest.fn().mockResolvedValue('access-token'),
    };
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string | number> = {
          'auth.accessSecret': 'test-access-secret',
          'auth.accessExpires': '15m',
          'auth.refreshExpiresDays': 7,
        };
        return values[key];
      }),
    };

    service = new AuthService(
      usersService as unknown as UsersService,
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
    );
  });

  it('registers with a normalized email, bcrypt cost 10, and signs in', async () => {
    usersService.findByEmail.mockResolvedValue(null);
    usersService.create.mockImplementation(
      (email: string, name: string, passwordHash: string) => {
        storedPasswordHash = passwordHash;
        return Promise.resolve({ ...user, email, name, passwordHash });
      },
    );

    const result = await service.register({
      email: '  Reader@Example.COM ',
      password: 'correct horse battery staple',
      name: ' Reader ',
    });

    expect(usersService.findByEmail).toHaveBeenCalledWith('reader@example.com');
    expect(storedPasswordHash).toBeDefined();
    if (!storedPasswordHash) {
      throw new Error('Expected a password hash to be stored');
    }
    expect(getRounds(storedPasswordHash)).toBe(10);
    await expect(
      compare('correct horse battery staple', storedPasswordHash),
    ).resolves.toBe(true);
    expect(jwtService.signAsync).toHaveBeenCalledWith(
      {
        sub: user.id,
        email: user.email,
        type: 'access',
      },
      expect.objectContaining({
        secret: 'test-access-secret',
        algorithm: 'HS256',
        expiresIn: '15m',
      }),
    );
    expect(result.accessToken).toBe('access-token');
    expect(typeof result.refreshToken).toBe('string');
    expect(result.user).toEqual({
      id: user.id,
      email: user.email,
      name: user.name,
    });
    expect(result.user).not.toHaveProperty('passwordHash');

    expect(refreshTokenWrite).toBeDefined();
    if (!refreshTokenWrite) {
      throw new Error('Expected a refresh token record to be stored');
    }
    expect(refreshTokenWrite.data.userId).toBe(user.id);
    expect(refreshTokenWrite.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(refreshTokenWrite.data.tokenHash).not.toBe(result.refreshToken);
    expect(refreshTokenWrite.data.expiresAt.getTime()).toBeGreaterThan(
      Date.now(),
    );
  });

  it('rejects an already registered email', async () => {
    usersService.findByEmail.mockResolvedValue(user);

    await expect(
      service.register({
        email: user.email,
        password: 'password123',
        name: user.name,
      }),
    ).rejects.toEqual(new ConflictException('该邮箱已被注册'));
    expect(usersService.create).not.toHaveBeenCalled();
  });

  it('logs in with the correct credentials', async () => {
    const passwordHash = await hash('password123', 10);
    usersService.findByEmail.mockResolvedValue({ ...user, passwordHash });

    const result = await service.login({
      email: ' READER@example.com ',
      password: 'password123',
    });

    expect(usersService.findByEmail).toHaveBeenCalledWith('reader@example.com');
    expect(result.accessToken).toBe('access-token');
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it.each([
    ['unknown email', null],
    [
      'wrong password',
      {
        ...user,
        passwordHash:
          '$2b$10$4c8PuaaX8oAA/2LdkLTPr.Z0zTOM5Vn7567dnqjqjKeITVTmCHcjq',
      },
    ],
  ])('uses the same error for %s', async (_case, foundUser) => {
    usersService.findByEmail.mockResolvedValue(foundUser);

    await expect(
      service.login({
        email: 'reader@example.com',
        password: 'definitely-wrong',
      }),
    ).rejects.toEqual(new UnauthorizedException('邮箱或密码错误'));
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('rotates a valid refresh token in one transaction', async () => {
    const rawToken = 'r'.repeat(43);
    const storedToken = {
      id: 'refresh-1',
      userId: user.id,
      tokenHash: createHash('sha256').update(rawToken).digest('hex'),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      replacedById: null,
      createdAt: new Date(),
      userAgent: null,
      ip: null,
      user,
    };
    transaction.refreshToken.findUnique.mockResolvedValue(storedToken);
    transaction.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    transaction.refreshToken.create.mockResolvedValue({ id: 'refresh-2' });
    transaction.refreshToken.update.mockResolvedValue({});

    const result = await service.refresh(rawToken);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.refreshToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: storedToken.tokenHash },
      include: { user: true },
    });
    expect(transaction.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        id: storedToken.id,
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) as Date },
      },
      data: { revokedAt: expect.any(Date) as Date },
    });
    expect(transaction.refreshToken.create).toHaveBeenCalledWith({
      data: {
        userId: user.id,
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/) as string,
        expiresAt: expect.any(Date) as Date,
      },
    });
    expect(transaction.refreshToken.update).toHaveBeenCalledWith({
      where: { id: storedToken.id },
      data: { replacedById: 'refresh-2' },
    });
    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.refreshToken).not.toBe(rawToken);
    expect(result.user).toEqual({
      id: user.id,
      email: user.email,
      name: user.name,
    });
  });

  it.each([
    ['an unknown token', null],
    [
      'an expired token',
      {
        id: 'refresh-expired',
        userId: user.id,
        tokenHash: 'expired',
        expiresAt: new Date(Date.now() - 60_000),
        revokedAt: null,
        replacedById: null,
        user,
      },
    ],
  ])('rejects %s without issuing tokens', async (_case, storedToken) => {
    transaction.refreshToken.findUnique.mockResolvedValue(storedToken);

    await expect(service.refresh('untrusted-token')).rejects.toEqual(
      new UnauthorizedException('无效的刷新令牌'),
    );
    expect(transaction.refreshToken.create).not.toHaveBeenCalled();
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('revokes every still-valid descendant when a revoked token is reused', async () => {
    const revokedToken = {
      id: 'refresh-1',
      userId: user.id,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
      replacedById: 'refresh-2',
      user,
    };
    transaction.refreshToken.findUnique
      .mockResolvedValueOnce(revokedToken)
      .mockResolvedValueOnce({ replacedById: 'refresh-3' })
      .mockResolvedValueOnce({ replacedById: null });
    transaction.refreshToken.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.refresh('reused-token')).rejects.toEqual(
      new UnauthorizedException('无效的刷新令牌'),
    );

    expect(transaction.refreshToken.updateMany).toHaveBeenCalledTimes(2);
    expect(transaction.refreshToken.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'refresh-2',
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) as Date },
      },
      data: { revokedAt: expect.any(Date) as Date },
    });
    expect(transaction.refreshToken.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'refresh-3',
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) as Date },
      },
      data: { revokedAt: expect.any(Date) as Date },
    });
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('allows only one concurrent rotation and revokes its descendant on reuse', async () => {
    const rawToken = 'c'.repeat(43);
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    let originalRevoked = false;
    let replacementRevoked = false;
    let replacementId: string | null = null;
    let markLinked: () => void = () => undefined;
    const linked = new Promise<void>((resolve) => {
      markLinked = resolve;
    });

    transaction.refreshToken.findUnique.mockImplementation(
      (input: { where: { tokenHash?: string; id?: string } }) => {
        if (input.where.tokenHash) {
          return Promise.resolve({
            id: 'refresh-1',
            userId: user.id,
            tokenHash,
            expiresAt: new Date(Date.now() + 60_000),
            revokedAt: null,
            replacedById: null,
            user,
          });
        }
        if (input.where.id === 'refresh-1') {
          return Promise.resolve({ replacedById: replacementId });
        }
        if (input.where.id === 'refresh-2') {
          return Promise.resolve({ replacedById: null });
        }
        return Promise.resolve(null);
      },
    );
    transaction.refreshToken.updateMany.mockImplementation(
      async (input: { where: { id: string } }) => {
        if (input.where.id === 'refresh-1') {
          if (!originalRevoked) {
            originalRevoked = true;
            return { count: 1 };
          }
          await linked;
          return { count: 0 };
        }
        if (input.where.id === 'refresh-2') {
          replacementRevoked = true;
          return { count: 1 };
        }
        return { count: 0 };
      },
    );
    transaction.refreshToken.create.mockResolvedValue({ id: 'refresh-2' });
    transaction.refreshToken.update.mockImplementation(
      (input: { data: { replacedById: string } }) => {
        replacementId = input.data.replacedById;
        markLinked();
        return Promise.resolve({});
      },
    );

    const results = await Promise.allSettled([
      service.refresh(rawToken),
      service.refresh(rawToken),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(
      1,
    );
    expect(transaction.refreshToken.create).toHaveBeenCalledTimes(1);
    expect(jwtService.signAsync).toHaveBeenCalledTimes(1);
    expect(replacementRevoked).toBe(true);
  });

  it('logs out only the session identified by the refresh token', async () => {
    const refreshToken = 'session-refresh-token';

    await service.logout(refreshToken);

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        tokenHash: createHash('sha256').update(refreshToken).digest('hex'),
        revokedAt: null,
      },
      data: { revokedAt: expect.any(Date) as Date },
    });
  });

  it('keeps repeated and unknown session logout idempotent', async () => {
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.logout('unknown-or-revoked')).resolves.toBeUndefined();
  });

  it('logs out every session belonging to the authenticated user', async () => {
    await service.logoutAll(user.id);

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        userId: user.id,
        revokedAt: null,
      },
      data: { revokedAt: expect.any(Date) as Date },
    });
  });
});
