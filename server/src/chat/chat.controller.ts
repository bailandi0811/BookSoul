import { Controller, Post, Get, Delete, Param, Body, Res, BadRequestException, Logger, UseGuards, HttpException } from '@nestjs/common';
import type { Response } from 'express';
import { AgentService } from '../agent/agent.service';
import { RagService } from '../rag/rag.service';
import { CurrentAuth } from '../auth/decorators/auth-context.decorator';
import type { AuthContext } from '../auth/auth-context';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { ChatDto } from './dto/chat.dto';

@Controller('api/chat')
@UseGuards(OptionalJwtAuthGuard)
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly agentService: AgentService,
    private readonly ragService: RagService,
  ) {}

  @Get('history')
  async getHistoryList(@CurrentAuth() auth: AuthContext) {
    try {
      const list = await this.agentService.getHistoryList(auth.userId);
      return { success: true, data: list };
    } catch (error) {
      this.logger.error('Failed to fetch history list', error);
      return { success: false, error: 'Failed to fetch history list' };
    }
  }

  @Get('history/:sessionId')
  async getSessionHistory(
    @Param('sessionId') sessionId: string,
    @CurrentAuth() auth: AuthContext,
  ) {
    if (!sessionId) {
      throw new BadRequestException('Session ID is required');
    }
    
    try {
      const messages = await this.agentService.getSessionHistory(
        sessionId,
        auth.userId,
      );
      return { success: true, data: messages };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('Failed to fetch session history');
      return { success: false, error: 'Failed to fetch session history' };
    }
  }

  @Delete('history/:sessionId')
  async deleteSession(
    @Param('sessionId') sessionId: string,
    @CurrentAuth() auth: AuthContext,
  ) {
    if (!sessionId) {
      throw new BadRequestException('Session ID is required');
    }

    try {
      const success = await this.agentService.deleteSession(
        sessionId,
        auth.userId,
      );
      if (success) {
        return { success: true };
      } else {
        return { success: false, error: 'Failed to delete session' };
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('Failed to delete session');
      return { success: false, error: 'Internal Server Error' };
    }
  }

  @Post()
  async chat(@Body() body: ChatDto, @Res() res: Response, @CurrentAuth() auth: AuthContext) {
    const { message, character, sessionId = 'default_session' } = body;
    const userId = auth.userId;

    if (!message) {
      throw new BadRequestException('Message is required');
    }

    await this.agentService.assertSessionWritable(sessionId, userId);

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Create an AbortController to pass the cancellation signal to the Agent
    const abortController = new AbortController();

    res.on('close', () => {
      this.logger.log('Client disconnected, aborting agent stream...');
      abortController.abort();
    });

    const writeEvent = (data: unknown): void => {
      if (!res.writableEnded && !res.destroyed) {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }
    };

    try {
      this.logger.log(`Received chat request. Character: ${character || 'assistant'}, SessionId: ${sessionId}`);

      // 使用Agentic RAG进行流式响应
      let hasSentReferences = false;

      for await (const event of this.agentService.streamChat(message, character || 'assistant', sessionId, userId, abortController.signal)) {
        switch (event.type) {
          case 'references':
            // 发送引用卡片（只发送一次）
            if (!hasSentReferences && event.data.length > 0) {
              writeEvent({ references: event.data });
              hasSentReferences = true;
            }
            break;

          case 'content':
            // 发送内容块
            if (event.data) {
              writeEvent({ content: event.data });
            }
            break;

          case 'thinking':
            // 发送思考进度
            writeEvent({ thinking: event.data });
            break;

          case 'memory_update':
            // 发送记忆更新事件
            writeEvent({ memoryUpdate: event.data });
            break;

          case 'metrics':
            // 发送性能指标事件（前端可选消费）
            writeEvent({ metrics: event.data });
            break;

          case 'final':
            // 最终响应（备用，可能为空因为content已经发送了完整内容）
            break;

          case 'error':
            // 错误处理
            this.logger.error(`Agent error: ${event.data}`);
            writeEvent({ error: event.data });
            break;
        }
      }

      if (!res.writableEnded && !res.destroyed) {
        res.write('data: [DONE]\n\n');
        res.end();
      }
    } catch (error) {
      this.logger.error('Chat API Error:', error);
      writeEvent({ error: 'Internal Server Error' });
      if (!res.writableEnded && !res.destroyed) res.end();
    }
  }
}
