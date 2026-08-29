import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import type { SuccessResponse } from '../auth/auth.types';
import type { AuthContext } from '../auth/auth-context';
import { CurrentAuth } from '../auth/decorators/auth-context.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BookReadingService } from './book-reading.service';
import { UpdateReadingProgressDto } from './dto/update-reading-progress.dto';

@Controller('api/books')
@UseGuards(JwtAuthGuard)
export class BookReadingController {
  constructor(private readonly reading: BookReadingService) {}

  @Get(':bookId/sections')
  async listSections(
    @Param('bookId') bookId: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<SuccessResponse<unknown>> {
    return {
      success: true,
      data: await this.reading.listSections(auth.userId, bookId),
    };
  }

  @Get(':bookId/reading-progress')
  async getProgress(
    @Param('bookId') bookId: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<SuccessResponse<unknown>> {
    return {
      success: true,
      data: await this.reading.getProgress(auth.userId, bookId),
    };
  }

  @Put(':bookId/reading-progress')
  async updateProgress(
    @Param('bookId') bookId: string,
    @Body() input: UpdateReadingProgressDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<SuccessResponse<unknown>> {
    return {
      success: true,
      data: await this.reading.updateProgress(auth.userId, bookId, input),
    };
  }
}
