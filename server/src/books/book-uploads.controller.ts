import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthContext } from '../auth/auth-context';
import { CurrentAuth } from '../auth/decorators/auth-context.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BookUploadsService } from './book-uploads.service';
import { CreateBookUploadDto } from './dto/create-book-upload.dto';

@Controller('api/books/uploads')
@UseGuards(JwtAuthGuard)
export class BookUploadsController {
  constructor(private readonly uploads: BookUploadsService) {}
  @Get()
  async list(@CurrentAuth() auth: AuthContext) {
    return { success: true, data: await this.uploads.list(auth.userId) };
  }
  @Post()
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @HttpCode(202)
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body() input: CreateBookUploadDto,
  ) {
    return {
      success: true,
      data: await this.uploads.create(auth.userId, input),
    };
  }
  @Get(':id')
  async get(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return { success: true, data: await this.uploads.get(auth.userId, id) };
  }
  @Post(':id/commit')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @HttpCode(202)
  async commit(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return { success: true, data: await this.uploads.commit(auth.userId, id) };
  }
  @Delete(':id')
  async cancel(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    await this.uploads.cancel(auth.userId, id);
    return { success: true, data: {} };
  }
}
