import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BooksModule } from '../books/books.module';
import { BookVectorModule } from '../vector/book-vector.module';
import { MemoryModule } from '../memory/memory.module';
import { BookChatService } from './book-chat.service';
import { BookChunkRetrieverService } from './book-chunk-retriever.service';
import { BookSessionsController } from './book-sessions.controller';
import { BookSessionsService } from './book-sessions.service';
import { ChatController } from './chat.controller';

@Module({
  imports: [AuthModule, BooksModule, BookVectorModule, MemoryModule],
  controllers: [ChatController, BookSessionsController],
  providers: [BookSessionsService, BookChunkRetrieverService, BookChatService],
  exports: [BookSessionsService, BookChunkRetrieverService, BookChatService],
})
export class ChatModule {}
