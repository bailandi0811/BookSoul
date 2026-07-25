import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { User } from '@prisma/client';
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

  private async issueTokens(user: User): Promise<AuthData> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      type: 'access',
    };
    const secret = getAccessTokenSecret(this.configService);
    const expiresIn = (this.configService.get<string>('auth.accessExpires') ??
      '15m') as JwtSignOptions['expiresIn'];

    const accessToken = await this.jwtService.signAsync(payload, {
      secret,
      algorithm: 'HS256',
      expiresIn,
    });
    const refreshToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: this.getRefreshTokenExpiry(),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: this.toPublicUser(user),
    };
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
