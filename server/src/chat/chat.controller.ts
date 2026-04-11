import { Controller, Post, Body, Res, Req, BadRequestException, Logger } from '@nestjs/common';
import type { Response, Request } from 'express';
import { AgentService } from '../agent/agent.service';
import { RagService } from '../rag/rag.service';

@Controller('api/chat')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly agentService: AgentService,
    private readonly ragService: RagService,
  ) {}

  @Post()
  async chat(@Body() body: { message: string; character?: string; sessionId?: string }, @Res() res: Response, @Req() req: Request) {
    const { message, character, sessionId = 'default_session' } = body;

    if (!message) {
      throw new BadRequestException('Message is required');
    }

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Create an AbortController to pass the cancellation signal to the Agent
    const abortController = new AbortController();

    req.on('close', () => {
      this.logger.log('Client disconnected, aborting agent stream...');
      abortController.abort();
    });

    try {
      this.logger.log(`Received question: ${message}, Character: ${character || 'assistant'}, SessionId: ${sessionId}`);

      // 使用Agentic RAG进行流式响应
      let hasSentReferences = false;

      for await (const event of this.agentService.streamChat(message, character || 'assistant', sessionId, abortController.signal)) {
        switch (event.type) {
          case 'references':
            // 发送引用卡片（只发送一次）
            if (!hasSentReferences && event.data.length > 0) {
              res.write(`data: ${JSON.stringify({ references: event.data })}\n\n`);
              hasSentReferences = true;
            }
            break;

          case 'content':
            // 发送内容块
            if (event.data) {
              res.write(`data: ${JSON.stringify({ content: event.data })}\n\n`);
            }
            break;

          case 'final':
            // 最终响应（备用，可能为空因为content已经发送了完整内容）
            break;

          case 'error':
            // 错误处理
            this.logger.error(`Agent error: ${event.data}`);
            res.write(`data: ${JSON.stringify({ error: event.data })}\n\n`);
            break;
        }
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      this.logger.error('Chat API Error:', error);
      res.write(`data: ${JSON.stringify({ error: 'Internal Server Error' })}\n\n`);
      res.end();
    }
  }
}
