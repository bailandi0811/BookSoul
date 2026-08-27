import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ChatController } from '../chat/chat.controller';
import { MemoryController } from '../memory/memory.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

describe('authenticated feature boundary', () => {
  it.each([
    ['chat', ChatController],
    ['memory', MemoryController],
  ])('requires JWT authentication for %s endpoints', (_name, controller) => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      controller,
    ) as unknown[];

    expect(guards).toContain(JwtAuthGuard);
  });
});
