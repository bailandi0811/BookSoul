import { ForbiddenException } from '@nestjs/common';
import type { AuthContext } from '../auth/auth-context';
import { MemoryController } from './memory.controller';
import { MemoryService } from './memory.service';

describe('MemoryController identity isolation', () => {
  const userAuth: AuthContext = {
    kind: 'user',
    userId: 'user-a',
    email: 'a@example.com',
    name: 'A',
  };
  let memoryService: {
    getMemories: jest.Mock;
    searchMemories: jest.Mock;
    updateMemory: jest.Mock;
    deleteMemory: jest.Mock;
  };
  let controller: MemoryController;

  beforeEach(() => {
    memoryService = {
      getMemories: jest.fn().mockResolvedValue([]),
      searchMemories: jest.fn().mockResolvedValue([]),
      updateMemory: jest.fn().mockResolvedValue(null),
      deleteMemory: jest.fn().mockResolvedValue(undefined),
    };
    controller = new MemoryController(
      memoryService as unknown as MemoryService,
    );
  });

  it('uses the authenticated identity for compatible legacy URLs', async () => {
    await controller.getMemories('user-a', 'session-1', userAuth);

    expect(memoryService.getMemories).toHaveBeenCalledWith(
      'user-a',
      'session-1',
      undefined,
    );
  });

  it('rejects another user id in path, body, and query', async () => {
    await expect(
      controller.getMemories('user-b', 'session-1', userAuth),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.updateMemory(
        'memory-1',
        { userId: 'user-b', content: 'tampered' },
        userAuth,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.deleteMemory('memory-1', 'user-b', userAuth),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps trusted user_id filtering for semantic search', async () => {
    await controller.searchMemories('user-a', userAuth, '乔峰', 3);

    expect(memoryService.searchMemories).toHaveBeenCalledWith(
      '乔峰',
      'user-a',
      3,
    );
  });
});
