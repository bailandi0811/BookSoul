import { Controller, Post, Body, Res, BadRequestException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { RagService } from '../rag/rag.service';

@Controller('api/chat')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(private readonly ragService: RagService) {}

  @Post()
  async chat(@Body() body: { message: string; character?: string }, @Res() res: Response) {
    const { message, character } = body;

    if (!message) {
      throw new BadRequestException('Message is required');
    }

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      this.logger.log(`Received question: ${message}, Character: ${character || 'assistant'}`);

      // 1. Retrieve context
      const retrievedContent = await this.ragService.retrieveRelevantContent(message);

      let context = '';
      if (retrievedContent.length === 0) {
        this.logger.log('No relevant content found.');
        res.write(`data: ${JSON.stringify({ references: [] })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ references: retrievedContent })}\n\n`);

        context = retrievedContent
          .map(
            (item, i) => `
[片段${i + 1}]
书名：${item.book_name}
章节：第 ${item.chapter_num} 章
内容：${item.content}
            `,
          )
          .join('\n\n----\n\n');
      }

      // 2. Generate Stream Response
      await this.ragService.generateResponseStream(message, context, res, character);
    } catch (error) {
      this.logger.error('Chat API Error:', error);
      res.write(`data: ${JSON.stringify({ error: 'Internal Server Error' })}\n\n`);
      res.end();
    }
  }
}
