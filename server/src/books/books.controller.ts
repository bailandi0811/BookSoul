import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import type { SuccessResponse } from '../auth/auth.types';
import type { AuthContext } from '../auth/auth-context';
import { CurrentAuth } from '../auth/decorators/auth-context.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { BookView, UploadedBookFile } from './books.types';
import { BooksService } from './books.service';

@Controller('api/books')
@UseGuards(JwtAuthGuard)
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Post()
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.ACCEPTED)
  async upload(
    @UploadedFile() file: UploadedBookFile | undefined,
    @CurrentAuth() auth: AuthContext,
  ): Promise<SuccessResponse<BookView>> {
    return {
      success: true,
      data: await this.booksService.createFromUpload(auth.userId, file),
    };
  }

  @Get()
  async list(
    @CurrentAuth() auth: AuthContext,
  ): Promise<SuccessResponse<BookView[]>> {
    return {
      success: true,
      data: await this.booksService.list(auth.userId),
    };
  }

  @Get(':bookId')
  async getById(
    @Param('bookId') bookId: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<SuccessResponse<BookView>> {
    return {
      success: true,
      data: await this.booksService.getById(auth.userId, bookId),
    };
  }

  @Post(':bookId/retry')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @HttpCode(HttpStatus.ACCEPTED)
  async retry(
    @Param('bookId') bookId: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<SuccessResponse<BookView>> {
    return {
      success: true,
      data: await this.booksService.retry(auth.userId, bookId),
    };
  }

  @Delete(':bookId')
  @HttpCode(HttpStatus.ACCEPTED)
  async delete(
    @Param('bookId') bookId: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<SuccessResponse<Record<string, never>>> {
    await this.booksService.delete(auth.userId, bookId);
    return { success: true, data: {} };
  }
}
