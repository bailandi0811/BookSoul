import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import type { PublicUser } from '../users/users.service';
import { AuthService } from './auth.service';
import type { AuthData, SuccessResponse } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

interface AuthenticatedRequest {
  user: PublicUser;
}

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto): Promise<SuccessResponse<AuthData>> {
    return {
      success: true,
      data: await this.authService.register(dto),
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<SuccessResponse<AuthData>> {
    return {
      success: true,
      data: await this.authService.login(dto),
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshTokenDto,
  ): Promise<SuccessResponse<AuthData>> {
    return {
      success: true,
      data: await this.authService.refresh(dto.refreshToken),
    };
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
}
