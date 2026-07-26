import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PublicUser, UsersService } from '../users/users.service';
import { getAccessTokenSecret } from './access-token.config';
import { AccessTokenPayload, AuthData } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const PASSWORD_HASH_COST = 10;
const INVALID_PASSWORD_HASH =
  '$2b$10$4c8PuaaX8oAA/2LdkLTPr.Z0zTOM5Vn7567dnqjqjKeITVTmCHcjq';
const INVALID_REFRESH_TOKEN_MESSAGE = '无效的刷新令牌';

interface GeneratedRefreshToken {
  value: string;
  hash: string;
  expiresAt: Date;
}

type RefreshTransactionResult =
  | { status: 'invalid' }
  | {
      status: 'rotated';
      refreshToken: string;
      user: User;
    };

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthData> {
    const email = this.normalizeEmail(dto.email);
    const existingUser = await this.usersService.findByEmail(email);

    if (existingUser) {
      throw new ConflictException('该邮箱已被注册');
    }

    const passwordHash = await hash(dto.password, PASSWORD_HASH_COST);
    const user = await this.usersService.create(
      email,
      dto.name.trim(),
      passwordHash,
    );

    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<AuthData> {
    const email = this.normalizeEmail(dto.email);
    const user = await this.usersService.findByEmail(email);
    const passwordMatches = await compare(
      dto.password,
      user?.passwordHash ?? INVALID_PASSWORD_HASH,
    );

    if (!user || !passwordMatches) {
      throw new UnauthorizedException('邮箱或密码错误');
    }

    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthData> {
    const tokenHash = this.hashRefreshToken(refreshToken);
    const now = new Date();

    const result = await this.prisma.$transaction(
      async (transaction): Promise<RefreshTransactionResult> => {
        const storedToken = await transaction.refreshToken.findUnique({
          where: { tokenHash },
          include: { user: true },
        });

        if (!storedToken) {
          return { status: 'invalid' };
        }

        if (storedToken.revokedAt) {
          await this.revokeReplacementChain(
            transaction,
            storedToken.replacedById,
            now,
          );
          return { status: 'invalid' };
        }

        if (storedToken.expiresAt <= now) {
          return { status: 'invalid' };
        }

        const claimed = await transaction.refreshToken.updateMany({
          where: {
            id: storedToken.id,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          data: { revokedAt: now },
        });

        if (claimed.count !== 1) {
          const currentToken = await transaction.refreshToken.findUnique({
            where: { id: storedToken.id },
            select: { replacedById: true },
          });
          await this.revokeReplacementChain(
            transaction,
            currentToken?.replacedById ?? null,
            now,
          );
          return { status: 'invalid' };
        }

        const replacement = this.generateRefreshToken();
        const replacementRecord = await transaction.refreshToken.create({
          data: {
            userId: storedToken.userId,
            tokenHash: replacement.hash,
            expiresAt: replacement.expiresAt,
          },
        });

        await transaction.refreshToken.update({
          where: { id: storedToken.id },
          data: { replacedById: replacementRecord.id },
        });

        return {
          status: 'rotated',
          refreshToken: replacement.value,
          user: storedToken.user,
        };
      },
    );

    if (result.status === 'invalid') {
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN_MESSAGE);
    }

    return {
      accessToken: await this.signAccessToken(result.user),
      refreshToken: result.refreshToken,
      user: this.toPublicUser(result.user),
    };
  }

  private async issueTokens(user: User): Promise<AuthData> {
    const accessToken = await this.signAccessToken(user);
    const refreshToken = this.generateRefreshToken();

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refreshToken.hash,
        expiresAt: refreshToken.expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: refreshToken.value,
      user: this.toPublicUser(user),
    };
  }

  private async signAccessToken(user: User): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      type: 'access',
    };
    const secret = getAccessTokenSecret(this.configService);
    const expiresIn = (this.configService.get<string>('auth.accessExpires') ??
      '15m') as JwtSignOptions['expiresIn'];

    return this.jwtService.signAsync(payload, {
      secret,
      algorithm: 'HS256',
      expiresIn,
    });
  }

  private generateRefreshToken(): GeneratedRefreshToken {
    const value = randomBytes(32).toString('base64url');

    return {
      value,
      hash: this.hashRefreshToken(value),
      expiresAt: this.getRefreshTokenExpiry(),
    };
  }

  private hashRefreshToken(refreshToken: string): string {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  private async revokeReplacementChain(
    transaction: Prisma.TransactionClient,
    replacementId: string | null,
    revokedAt: Date,
  ): Promise<void> {
    const visited = new Set<string>();
    let currentId = replacementId;

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const token = await transaction.refreshToken.findUnique({
        where: { id: currentId },
        select: { replacedById: true },
      });

      if (!token) {
        return;
      }

      await transaction.refreshToken.updateMany({
        where: {
          id: currentId,
          revokedAt: null,
          expiresAt: { gt: revokedAt },
        },
        data: { revokedAt },
      });
      currentId = token.replacedById;
    }
  }

  private getRefreshTokenExpiry(): Date {
    const configuredDays = this.configService.get<string | number>(
      'auth.refreshExpiresDays',
    );
    const days = Number(configuredDays ?? 7);

    if (!Number.isFinite(days) || days <= 0) {
      throw new InternalServerErrorException(
        'REFRESH_TOKEN_EXPIRES_DAYS must be a positive number',
      );
    }

    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
    };
  }
}
