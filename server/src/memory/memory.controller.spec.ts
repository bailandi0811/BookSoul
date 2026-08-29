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

  it('canonical URLs do not accept a client-supplied user id', async () => {
    await controller.getCurrentMemories(userAuth, {
      sessionId: 'session-1',
    });
    await controller.searchCurrentMemories(userAuth, {
      q: '乔峰',
      topK: 4,
    });

    expect(memoryService.getMemories).toHaveBeenCalledWith(
      'user-a',
      'session-1',
      undefined,
    );
    expect(memoryService.searchMemories).toHaveBeenCalledWith(
      '乔峰',
      'user-a',
      4,
    );
  });

  it('rejects another user id in legacy paths', async () => {
    await expect(
      controller.getMemories('user-b', 'session-1', userAuth),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('always passes the authenticated identity to mutations', async () => {
    await controller.updateMemory(
      'memory-1',
      { content: 'trusted update' },
      userAuth,
    );
    await controller.deleteMemory('memory-1', userAuth);

    expect(memoryService.updateMemory).toHaveBeenCalledWith(
      'memory-1',
      'user-a',
      { content: 'trusted update' },
    );
    expect(memoryService.deleteMemory).toHaveBeenCalledWith(
      'memory-1',
      'user-a',
    );
  });

  it('keeps trusted user_id filtering for semantic search', async () => {
    await controller.searchMemories('user-a', userAuth, { q: '乔峰', topK: 3 });

    expect(memoryService.searchMemories).toHaveBeenCalledWith(
      '乔峰',
      'user-a',
      3,
    );
  });
});
