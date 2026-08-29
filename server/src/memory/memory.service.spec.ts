import { MemoryService } from './memory.service';
import {
  MemoryCategory,
  MemoryEntry,
  MemoryLevel,
  UserProfile,
} from './interfaces/memory.types';
import { ImportanceScorerStrategy } from './strategies/importance-scorer.strategy';

describe('MemoryService gate, scope, and recall', () => {
  const baseMemory = (overrides: Partial<MemoryEntry> = {}): MemoryEntry => ({
    id: 'mem_one',
    userId: 'user-a',
    sessionId: 'session-a',
    level: MemoryLevel.LONG_TERM,
    content: '我喜欢乔峰',
    importance: 0.85,
    category: MemoryCategory.PREFERENCE,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    metadata: { editable: true, verified: true },
    ...overrides,
  });

  let service: MemoryService;
  let memoryRepo: {
    generateId: jest.Mock;
    getByUserId: jest.Mock;
    getByLevel: jest.Mock;
    getForBookContext: jest.Mock;
    update: jest.Mock;
  };
  let profileRepo: {
    getByUserId: jest.Mock;
    createDefault: jest.Mock;
  };
  let persistMemory: jest.Mock;
  let storeToMilvus: jest.Mock;

  beforeEach(() => {
    memoryRepo = {
      generateId: jest.fn().mockReturnValue('mem_new'),
      getByUserId: jest.fn().mockResolvedValue([]),
      getByLevel: jest.fn().mockResolvedValue([]),
      getForBookContext: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(null),
    };
    profileRepo = {
      getByUserId: jest.fn().mockResolvedValue([]),
      createDefault: jest.fn(
        (userId: string, sessionId: string): UserProfile => ({
          userId,
          sessionId,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          preferences: { favoriteCharacters: [], interests: [] },
          facts: {},
          summary: '',
        }),
      ),
    };
    persistMemory = jest.fn().mockResolvedValue(undefined);
    storeToMilvus = jest.fn().mockResolvedValue(undefined);
    service = Object.create(MemoryService.prototype) as MemoryService;
    Object.defineProperties(service, {
      MEMORY_GATE_THRESHOLD: { value: 0.7 },
      importanceScorer: { value: new ImportanceScorerStrategy() },
      memoryEntryRepo: { value: memoryRepo },
      userProfileRepo: { value: profileRepo },
      logger: { value: { warn: jest.fn(), error: jest.fn() } },
      persistMemory: { value: persistMemory },
      storeToMilvus: { value: storeToMilvus },
    });
  });

  it('does not turn ordinary long chat messages into permanent memory', async () => {
    const result = await service.processAndStoreMemory(
      'user-a',
      'session-a',
      '这一段只是普通的小说剧情讨论，即使句子比较长也不代表它是用户偏好。',
    );

    expect(result.hasNewMemories).toBe(false);
    expect(persistMemory).not.toHaveBeenCalled();
  });

  it('creates a proposal for inferred preferences and confirms explicit requests', async () => {
    const proposed = await service.processAndStoreMemory(
      'user-a',
      'session-a',
      '我喜欢乔峰',
    );
    const confirmed = await service.processAndStoreMemory(
      'user-a',
      'session-a',
      '请记住我喜欢段誉',
    );

    expect(proposed.proposedCount).toBe(1);
    expect(
      (persistMemory.mock.calls[0][0] as MemoryEntry).metadata.verified,
    ).toBe(false);
    expect(confirmed.confirmedCount).toBe(1);
    expect(
      (persistMemory.mock.calls[1][0] as MemoryEntry).metadata.verified,
    ).toBe(true);
  });

  it('never auto-saves likely credentials', async () => {
    await service.processAndStoreMemory(
      'user-a',
      'session-a',
      '请记住我的支付密码是 123456',
    );

    expect(persistMemory).not.toHaveBeenCalled();
  });

  it('deduplicates repeated memories and upgrades explicit confirmation', async () => {
    const duplicate = baseMemory({
      metadata: { editable: true, verified: false, occurrences: 1 },
    });
    memoryRepo.getByUserId.mockResolvedValue([duplicate]);
    memoryRepo.update.mockResolvedValue({
      ...duplicate,
      metadata: { ...duplicate.metadata, verified: true, occurrences: 2 },
    });

    const result = await service.processAndStoreMemory(
      'user-a',
      'session-b',
      '请记住我喜欢乔峰',
    );

    expect(result).toMatchObject({ updatedCount: 1, confirmedCount: 1 });
    expect(memoryRepo.update).toHaveBeenCalledWith(
      'mem_one',
      'user-a',
      expect.objectContaining({
        metadata: expect.objectContaining({ verified: true, occurrences: 2 }),
      }),
    );
  });

  it('recalls only confirmed memories owned by the authenticated user', async () => {
    const confirmed = baseMemory();
    const proposed = baseMemory({
      id: 'mem_proposed',
      metadata: { editable: true, verified: false },
    });
    const foreign = baseMemory({ id: 'mem_foreign', userId: 'user-b' });
    jest
      .spyOn(service, 'searchMemories')
      .mockResolvedValue([foreign, proposed, confirmed]);
    memoryRepo.getByUserId.mockResolvedValue([confirmed, proposed]);

    const context = await service.buildAgentContext(
      'user-a',
      'session-new',
      '我喜欢谁？',
    );

    expect(context.recalledMemoryIds).toEqual(['mem_one']);
    expect(context.text).toContain('我喜欢乔峰');
    expect(context.text).not.toContain('mem_foreign');
  });

  it('shares long-term memory across sessions but keeps episodic memory local', async () => {
    memoryRepo.getByUserId.mockResolvedValue([
      baseMemory({ id: 'long-other', sessionId: 'session-b' }),
      baseMemory({
        id: 'episode-other',
        sessionId: 'session-b',
        level: MemoryLevel.EPISODIC,
      }),
      baseMemory({
        id: 'episode-current',
        sessionId: 'session-a',
        level: MemoryLevel.EPISODIC,
      }),
    ]);

    await expect(service.getMemories('user-a', 'session-a')).resolves.toEqual([
      expect.objectContaining({ id: 'long-other' }),
      expect.objectContaining({ id: 'episode-current' }),
    ]);
  });

  it('stores explicit reading notes inside the current book scope', async () => {
    const result = await service.processAndStoreBookMemory(
      'user-a',
      'session-a',
      'book-a',
      '请记住这本书里我怀疑客栈旧友在说谎',
    );

    expect(result.confirmedCount).toBe(1);
    expect(persistMemory).toHaveBeenCalledWith(
      expect.objectContaining({ bookId: 'book-a', userId: 'user-a' }),
    );
  });

  it('keeps universal response preferences global', async () => {
    await service.processAndStoreBookMemory(
      'user-a',
      'session-a',
      'book-a',
      '请记住以后回答要简洁',
    );

    expect(persistMemory).toHaveBeenCalledWith(
      expect.objectContaining({ bookId: null }),
    );
  });

  it('builds book context from global and current-book memories only', async () => {
    memoryRepo.getForBookContext.mockResolvedValue([
      baseMemory({ id: 'global', bookId: null, content: '回答要简洁' }),
      baseMemory({ id: 'current', bookId: 'book-a', content: '我怀疑旧友' }),
      baseMemory({ id: 'other', bookId: 'book-b', content: '另一本书的秘密' }),
      baseMemory({
        id: 'unverified',
        bookId: 'book-a',
        content: '未经确认',
        metadata: { editable: true, verified: false },
      }),
    ]);

    const context = await service.buildBookAgentContext(
      'user-a',
      'session-a',
      'book-a',
      '旧友是谁？',
    );

    expect(context.recalledMemoryIds).toEqual(['current', 'global']);
    expect(context.text).toContain('我怀疑旧友');
    expect(context.text).toContain('回答要简洁');
    expect(context.text).not.toContain('另一本书');
    expect(context.text).not.toContain('未经确认');
  });
});
