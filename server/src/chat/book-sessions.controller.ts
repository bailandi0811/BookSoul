import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { SuccessResponse } from '../auth/auth.types';
import type { AuthContext } from '../auth/auth-context';
import { CurrentAuth } from '../auth/decorators/auth-context.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BookSessionsService } from './book-sessions.service';

@Controller('api/books')
@UseGuards(JwtAuthGuard)
export class BookSessionsController {
  constructor(private readonly sessions: BookSessionsService) {}

  @Post(':bookId/sessions')
  async create(
    @Param('bookId') bookId: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<SuccessResponse<unknown>> {
    return {
      success: true,
      data: await this.sessions.create(auth.userId, bookId),
    };
  }

  @Get(':bookId/sessions')
  async list(
    @Param('bookId') bookId: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<SuccessResponse<unknown>> {
    return {
      success: true,
      data: await this.sessions.list(auth.userId, bookId),
    };
  }
}
