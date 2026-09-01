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
  ConflictException,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthContext } from '../auth/auth-context';
import { CurrentAuth } from '../auth/decorators/auth-context.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BookChatService } from './book-chat.service';
import { BookSessionsService } from './book-sessions.service';
import { ChatDto } from './dto/chat.dto';
import { AgentRunStatus } from '@prisma/client';
import { AgentAdmissionService } from './admission/agent-admission.service';
import type { AgentRunFinalStatus } from './admission/agent-admission.types';

@Controller('api/chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly chatService: BookChatService,
    private readonly sessions: BookSessionsService,
    private readonly admission: AgentAdmissionService,
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

    const abortController = new AbortController();
    const onClose = (): void => abortController.abort();
    res.on('close', onClose);
    const admission = await this.admission
      .acquire(
        {
          ownerId: context.ownerId,
          sessionId: context.sessionId,
          bookId: context.bookId,
        },
        () => abortController.abort(),
      )
      .catch((error: unknown) => {
        res.off('close', onClose);
        throw error;
      });
    if (!admission.accepted) {
      res.off('close', onClose);
      if (admission.reason === 'SESSION_BUSY') {
        throw new ConflictException({
          message: '当前会话正在生成回答，请等待完成后再提问',
          code: 'AGENT_SESSION_BUSY',
          retryAfterSeconds: admission.retryAfterSeconds,
        });
      }
      res.setHeader('Retry-After', String(admission.retryAfterSeconds));
      throw new HttpException(
        {
          message:
            admission.reason === 'USER_LIMIT'
              ? '你正在运行的阅读助手较多，请稍后再试'
              : '阅读助手当前繁忙，请稍后再试',
          code:
            admission.reason === 'USER_LIMIT'
              ? 'AGENT_USER_LIMIT'
              : 'AGENT_CAPACITY_EXCEEDED',
          retryAfterSeconds: admission.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const writeEvent = (data: unknown): void => {
      if (!res.writableEnded && !res.destroyed) {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }
    };

    let finalStatus: AgentRunFinalStatus = AgentRunStatus.FAILED;
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
      finalStatus = abortController.signal.aborted
        ? admission.lease.hasLostLease()
          ? AgentRunStatus.LEASE_LOST
          : AgentRunStatus.CANCELLED
        : AgentRunStatus.SUCCEEDED;
      if (
        finalStatus === AgentRunStatus.SUCCEEDED &&
        !res.writableEnded &&
        !res.destroyed
      ) {
        res.write('data: [DONE]\n\n');
        res.end();
      }
    } catch {
      finalStatus = abortController.signal.aborted
        ? admission.lease.hasLostLease()
          ? AgentRunStatus.LEASE_LOST
          : AgentRunStatus.CANCELLED
        : AgentRunStatus.FAILED;
      if (abortController.signal.aborted) return;
      this.logger.error(`Book chat failed for session ${body.sessionId}`);
      writeEvent({ error: '小说助手暂时不可用，请稍后重试' });
      if (!res.writableEnded && !res.destroyed) res.end();
    } finally {
      res.off('close', onClose);
      await admission.lease.finish(finalStatus);
    }
  }
}
