import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { RagModule } from '../rag/rag.module';
import { AgentModule } from '../agent/agent.module';

@Module({
  imports: [RagModule, AgentModule],
  controllers: [ChatController],
})
export class ChatModule {}
