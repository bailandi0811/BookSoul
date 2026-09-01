import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BooksModule } from '../books/books.module';
import { BookVectorModule } from '../vector/book-vector.module';
import { MemoryModule } from '../memory/memory.module';
import { McpModule } from '../mcp/mcp.module';
import { BookChatService } from './book-chat.service';
import { BookContextPlannerService } from './book-context-planner.service';
import { BookContextService } from './book-context.service';
import { BookChunkRetrieverService } from './book-chunk-retriever.service';
import { BookSessionsController } from './book-sessions.controller';
import { BookSessionsService } from './book-sessions.service';
import { ChatController } from './chat.controller';
import { ExternalResearchService } from './external-research.service';
import { AgentAdmissionService } from './admission/agent-admission.service';
import { AgentAdmissionStore } from './admission/agent-admission.store';

@Module({
  imports: [AuthModule, BooksModule, BookVectorModule, MemoryModule, McpModule],
  controllers: [ChatController, BookSessionsController],
  providers: [
    BookSessionsService,
    BookContextPlannerService,
    BookChunkRetrieverService,
    BookContextService,
    ExternalResearchService,
    BookChatService,
    AgentAdmissionStore,
    AgentAdmissionService,
  ],
  exports: [BookSessionsService, BookChunkRetrieverService, BookChatService],
})
export class ChatModule {}
