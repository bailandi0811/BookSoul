import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import type { SuccessResponse } from '../auth/auth.types';
import type { AuthContext } from '../auth/auth-context';
import { CurrentAuth } from '../auth/decorators/auth-context.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BookAssistantsService } from './book-assistants.service';
import { UpdateBookAssistantDto } from './dto/update-book-assistant.dto';

@Controller('api/books')
@UseGuards(JwtAuthGuard)
export class BookAssistantsController {
  constructor(private readonly assistants: BookAssistantsService) {}

  @Get(':bookId/assistant')
  async get(
    @Param('bookId') bookId: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<SuccessResponse<unknown>> {
    return {
      success: true,
      data: await this.assistants.get(auth.userId, bookId),
    };
  }

  @Patch(':bookId/assistant')
  async update(
    @Param('bookId') bookId: string,
    @Body() input: UpdateBookAssistantDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<SuccessResponse<unknown>> {
    return {
      success: true,
      data: await this.assistants.update(auth.userId, bookId, input),
    };
  }
}
