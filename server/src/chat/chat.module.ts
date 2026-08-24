import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { RagModule } from '../rag/rag.module';
import { AgentModule } from '../agent/agent.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [RagModule, AgentModule, AuthModule],
  controllers: [ChatController],
})
export class ChatModule {}
