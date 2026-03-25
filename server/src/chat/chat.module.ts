import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { RagModule } from '../rag/rag.module';

@Module({
  imports: [RagModule],
  controllers: [ChatController],
})
export class ChatModule {}
