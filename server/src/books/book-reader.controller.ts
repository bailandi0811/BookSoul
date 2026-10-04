import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentAuth } from '../auth/decorators/auth-context.decorator';
import type { AuthContext } from '../auth/auth-context';
import { BookReaderService } from './book-reader.service';
import { ReadSectionWindowDto } from './dto/read-section-window.dto';
import { UpdateReaderPositionDto } from './dto/update-reader-position.dto';
import { BookReaderPositionService } from './book-reader-position.service';

@Controller('api/books')
@UseGuards(JwtAuthGuard)
export class BookReaderController {
  constructor(
    private readonly reader: BookReaderService,
    private readonly positions: BookReaderPositionService,
  ) {}

  @Get(':bookId/sections/:sectionId/content')
  @Header('Cache-Control', 'private, no-store')
  async section(
    @CurrentAuth() auth: AuthContext,
    @Param('bookId') bookId: string,
    @Param('sectionId') sectionId: string,
    @Query() query: ReadSectionWindowDto,
  ) {
    return {
      success: true,
      data: await this.reader.getSectionWindow(
        auth.userId,
        bookId,
        sectionId,
        query,
      ),
    };
  }

  @Get(':bookId/chunks/:chunkId/location')
  @Header('Cache-Control', 'private, no-store')
  async location(
    @CurrentAuth() auth: AuthContext,
    @Param('bookId') bookId: string,
    @Param('chunkId') chunkId: string,
  ) {
    return {
      success: true,
      data: await this.reader.getReferenceLocation(
        auth.userId,
        bookId,
        chunkId,
      ),
    };
  }

  @Get(':bookId/reading-position')
  @Header('Cache-Control', 'private, no-store')
  async position(
    @CurrentAuth() auth: AuthContext,
    @Param('bookId') bookId: string,
  ) {
    return {
      success: true,
      data: await this.positions.getPosition(auth.userId, bookId),
    };
  }

  @Put(':bookId/reading-position')
  @Header('Cache-Control', 'private, no-store')
  async savePosition(
    @CurrentAuth() auth: AuthContext,
    @Param('bookId') bookId: string,
    @Body() input: UpdateReaderPositionDto,
  ) {
    return {
      success: true,
      data: await this.positions.savePosition(auth.userId, bookId, input),
    };
  }
}
