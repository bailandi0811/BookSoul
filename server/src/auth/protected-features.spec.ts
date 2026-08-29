import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ChatController } from '../chat/chat.controller';
import { MemoryController } from '../memory/memory.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { BooksController } from '../books/books.controller';
import { BookAssistantsController } from '../books/book-assistants.controller';
import { BookReadingController } from '../books/book-reading.controller';
import { BookSessionsController } from '../chat/book-sessions.controller';

describe('authenticated feature boundary', () => {
  it.each([
    ['chat', ChatController],
    ['memory', MemoryController],
    ['books', BooksController],
    ['book assistants', BookAssistantsController],
    ['book reading', BookReadingController],
    ['book sessions', BookSessionsController],
  ])('requires JWT authentication for %s endpoints', (_name, controller) => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      controller,
    ) as unknown[];

    expect(guards).toContain(JwtAuthGuard);
  });
});
