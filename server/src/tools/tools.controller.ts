import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { SuccessResponse } from '../auth/auth.types';
import { SendEmailDto } from './dto/send-email.dto';
import { ToolsService } from './tools.service';

@Controller('api/tools')
@UseGuards(JwtAuthGuard)
export class ToolsController {
  constructor(private readonly toolsService: ToolsService) {}

  @Post('email')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async sendEmail(
    @Body() dto: SendEmailDto,
  ): Promise<SuccessResponse<Record<string, never>>> {
    await this.toolsService.sendConfirmedEmail(dto);
    return { success: true, data: {} };
  }
}
