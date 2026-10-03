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
import { PublicUser, toPublicUser, UsersService } from '../users/users.service';
import { getAccessTokenSecret } from './access-token.config';
import { AccessTokenPayload, AuthData } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthChallengesService } from './auth-challenges.service';
import { assertNewPasswordPolicy, normalizeEmail } from './auth-input.policy';
import { invalidVerificationCode } from './auth-email-verification.service';
import { lockAuthUser } from './auth-user-lock';

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
    private readonly challenges: AuthChallengesService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthData> {
    assertNewPasswordPolicy(dto.password);
    const email = normalizeEmail(dto.email);
    const passwordHash = await hash(dto.password, PASSWORD_HASH_COST);
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const proof = await this.challenges.verify(
          tx,
          {
            email,
            purpose: 'REGISTRATION',
            userId: null,
            verificationId: dto.verificationId,
            secret: dto.code,
          },
          () => new Date(),
        );
        if (proof.status === 'invalid') return null;
        if (await tx.user.findUnique({ where: { email } }))
          throw new ConflictException({
            code: 'EMAIL_ALREADY_REGISTERED',
            message: '该邮箱已被注册',
          });
        const user = await tx.user.create({
          data: {
            email,
            name: dto.name.trim(),
            passwordHash,
            emailVerifiedAt: new Date(),
          },
        });
        const refreshToken = await this.storeRefreshToken(tx, user.id);
        if (
          !(await this.challenges.consume(
            tx,
            proof.challenge,
            () => new Date(),
          ))
        )
          throw invalidVerificationCode();
        return { user, refreshToken };
      });
      if (!result) throw invalidVerificationCode();
      return {
        accessToken: await this.signAccessToken(result.user),
        refreshToken: result.refreshToken,
        user: toPublicUser(result.user),
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException({
          code: 'EMAIL_ALREADY_REGISTERED',
          message: '该邮箱已被注册',
        });
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthData> {
    const email = normalizeEmail(dto.email);
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
    const located = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { userId: true },
    });
    if (!located)
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN_MESSAGE);

    const result = await this.prisma.$transaction(
      async (transaction): Promise<RefreshTransactionResult> => {
        const user = await lockAuthUser(transaction, located.userId);
        if (!user) return { status: 'invalid' };
        const now = new Date();
        const storedToken = await transaction.refreshToken.findUnique({
          where: { tokenHash },
          include: { user: true },
        });

        if (!storedToken || storedToken.userId !== user.id) {
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
          user,
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

  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash: this.hashRefreshToken(refreshToken),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(user: User): Promise<AuthData> {
    const result = await this.prisma.$transaction(async (tx) => {
      const current = await lockAuthUser(tx, user.id);
      if (
        !current ||
        current.passwordHash !== user.passwordHash ||
        current.authVersion !== user.authVersion
      )
        throw new UnauthorizedException('邮箱或密码错误');
      return {
        user: current,
        refreshToken: await this.storeRefreshToken(tx, current.id),
      };
    });
    return {
      accessToken: await this.signAccessToken(result.user),
      refreshToken: result.refreshToken,
      user: this.toPublicUser(result.user),
    };
  }

  private async storeRefreshToken(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<string> {
    const token = this.generateRefreshToken();
    await tx.refreshToken.create({
      data: { userId, tokenHash: token.hash, expiresAt: token.expiresAt },
    });
    return token.value;
  }

  private async signAccessToken(user: User): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      type: 'access',
      authVersion: user.authVersion,
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

  private toPublicUser(user: User): PublicUser {
    return toPublicUser(user);
  }
}
