import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Request,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request as ExpressRequest, Response } from 'express';
import type { PublicUser } from '../users/users.service';
import { AuthService } from './auth.service';
import type { AuthData, PublicAuthData, SuccessResponse } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

interface AuthenticatedRequest {
  user: PublicUser;
}

interface CookieRequest extends ExpressRequest {
  cookies: Record<string, string | undefined>;
}

const REFRESH_COOKIE = 'booksoul_refresh';

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SuccessResponse<PublicAuthData>> {
    const auth = await this.authService.register(dto);
    this.setRefreshCookie(response, auth.refreshToken);
    return {
      success: true,
      data: this.toPublicAuthData(auth),
    };
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SuccessResponse<PublicAuthData>> {
    const auth = await this.authService.login(dto);
    this.setRefreshCookie(response, auth.refreshToken);
    return {
      success: true,
      data: this.toPublicAuthData(auth),
    };
  }

  @Post('refresh')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SuccessResponse<PublicAuthData>> {
    const refreshToken = this.getRefreshToken(request);
    const auth = await this.authService.refresh(refreshToken);
    this.setRefreshCookie(response, auth.refreshToken);
    return {
      success: true,
      data: this.toPublicAuthData(auth),
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SuccessResponse<Record<string, never>>> {
    const refreshToken = request.cookies?.[REFRESH_COOKIE];
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    this.clearRefreshCookie(response);
    return { success: true, data: {} };
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @Request() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SuccessResponse<Record<string, never>>> {
    await this.authService.logoutAll(request.user.id);
    this.clearRefreshCookie(response);
    return { success: true, data: {} };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  me(
    @Request() request: AuthenticatedRequest,
  ): SuccessResponse<{ user: PublicUser }> {
    return {
      success: true,
      data: {
        user: request.user,
      },
    };
  }

  private getRefreshToken(request: CookieRequest): string {
    const refreshToken = request.cookies?.[REFRESH_COOKIE];
    if (!refreshToken) {
      throw new UnauthorizedException('缺少刷新令牌');
    }
    return refreshToken;
  }

  private setRefreshCookie(response: Response, refreshToken: string): void {
    const refreshDays = Number(
      this.configService.get<string | number>('auth.refreshExpiresDays') ?? 7,
    );
    response.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: refreshDays * 24 * 60 * 60 * 1000,
    });
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth',
    });
  }

  private toPublicAuthData(auth: AuthData): PublicAuthData {
    return { accessToken: auth.accessToken, user: auth.user };
  }
}
