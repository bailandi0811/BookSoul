import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Body,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthContext } from '../auth/auth-context';
import { CurrentAuth } from '../auth/decorators/auth-context.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BookChatService } from './book-chat.service';
import { BookSessionsService } from './book-sessions.service';
import { ChatDto } from './dto/chat.dto';

@Controller('api/chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly chatService: BookChatService,
    private readonly sessions: BookSessionsService,
  ) {}

  @Get('history')
  async getHistoryList(@CurrentAuth() auth: AuthContext) {
    return {
      success: true,
      data: await this.sessions.listAll(auth.userId),
    };
  }

  @Get('history/:sessionId')
  async getSessionHistory(
    @Param('sessionId') sessionId: string,
    @CurrentAuth() auth: AuthContext,
  ) {
    if (!sessionId) throw new BadRequestException('Session ID is required');
    return {
      success: true,
      data: await this.sessions.getHistory(auth.userId, sessionId),
    };
  }

  @Delete('history/:sessionId')
  async deleteSession(
    @Param('sessionId') sessionId: string,
    @CurrentAuth() auth: AuthContext,
  ) {
    if (!sessionId) throw new BadRequestException('Session ID is required');
    await this.sessions.delete(auth.userId, sessionId);
    return { success: true };
  }

  @Post()
  async chat(
    @Body() body: ChatDto,
    @Res() res: Response,
    @CurrentAuth() auth: AuthContext,
  ): Promise<void> {
    const context = await this.sessions.resolve(
      auth.userId,
      body.sessionId,
      body.spoilerOverride === true,
    );

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const abortController = new AbortController();
    res.on('close', () => abortController.abort());
    const writeEvent = (data: unknown): void => {
      if (!res.writableEnded && !res.destroyed) {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }
    };

    try {
      for await (const event of this.chatService.stream(context, body.message, {
        externalResearch: body.externalResearch === true,
        abortSignal: abortController.signal,
        accountEmail: auth.kind === 'user' ? auth.email : undefined,
      })) {
        if (event.type === 'references') {
          writeEvent({ references: event.data });
        } else if (event.type === 'external_references') {
          writeEvent({ externalReferences: event.data });
        } else if (event.type === 'content') {
          writeEvent({ content: event.data });
        } else if (event.type === 'email_draft') {
          writeEvent({ emailDraft: event.data });
        } else if (event.type === 'memory_update') {
          writeEvent({ memoryUpdate: event.data });
        } else {
          writeEvent({ thinking: event.data });
        }
      }
      if (!res.writableEnded && !res.destroyed) {
        res.write('data: [DONE]\n\n');
        res.end();
      }
    } catch {
      this.logger.error(`Book chat failed for session ${body.sessionId}`);
      writeEvent({ error: '小说助手暂时不可用，请稍后重试' });
      if (!res.writableEnded && !res.destroyed) res.end();
    }
  }
}
