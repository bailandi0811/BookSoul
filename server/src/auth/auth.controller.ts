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
import { AuthEmailVerificationService } from './auth-email-verification.service';
import { AuthPasswordResetService } from './auth-password-reset.service';
import { RequestRegistrationCodeDto } from './dto/request-registration-code.dto';
import {
  ConfirmEmailVerificationDto,
  RequestCurrentUserCodeDto,
} from './dto/confirm-email-verification.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

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
    private readonly verification: AuthEmailVerificationService,
    private readonly recovery: AuthPasswordResetService,
  ) {}

  @Post('registration-code')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async registrationCode(@Body() dto: RequestRegistrationCodeDto) {
    return {
      success: true,
      data: await this.verification.requestRegistrationCode(dto.email),
    };
  }

  @Post('email-verification/code')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async currentUserCode(
    @Request() request: AuthenticatedRequest,
    @Body() _dto: RequestCurrentUserCodeDto,
  ) {
    return {
      success: true,
      data: await this.verification.requestCurrentUserCode(request.user.id),
    };
  }

  @Post('email-verification/confirm')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async confirmEmail(
    @Request() request: AuthenticatedRequest,
    @Body() dto: ConfirmEmailVerificationDto,
  ) {
    return {
      success: true,
      data: {
        user: await this.verification.confirmCurrentUserEmail(
          request.user.id,
          dto,
        ),
      },
    };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return { success: true, data: await this.recovery.requestReset(dto.email) };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.recovery.resetPassword(dto);
    this.clearRefreshCookie(response);
    return { success: true, data: { message: '密码已重置，请重新登录。' } };
  }

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
