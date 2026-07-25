import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { compare, getRounds, hash } from 'bcryptjs';
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
});
