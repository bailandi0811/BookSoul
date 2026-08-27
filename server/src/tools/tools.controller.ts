import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SendEmailDto } from './dto/send-email.dto';
import { ToolsService } from './tools.service';

@Controller('api/tools')
@UseGuards(JwtAuthGuard)
export class ToolsController {
  constructor(private readonly toolsService: ToolsService) {}

  @Post('email')
  @HttpCode(HttpStatus.OK)
  async sendEmail(@Body() dto: SendEmailDto) {
    await this.toolsService.sendConfirmedEmail(dto);
    return { success: true };
  }
}
