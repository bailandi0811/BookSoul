import { AssistantResponseDepth, AssistantTone } from '@prisma/client';
import { MemoryService } from '../memory/memory.service';
import { BookChunkRetrieverService } from './book-chunk-retriever.service';
import {
  type BookContextPlan,
  BookContextPlannerService,
} from './book-context-planner.service';
import { BookContextService } from './book-context.service';
import {
  type BookChatContext,
  BookSessionsService,
} from './book-sessions.service';
import { ExternalResearchService } from './external-research.service';

describe('BookContextService', () => {
  let sessions: { getRecentMessages: jest.Mock };
  let planner: { plan: jest.Mock };
  let retriever: { retrieve: jest.Mock };
  let memory: { buildBookAgentContext: jest.Mock };
  let externalResearch: { search: jest.Mock };
  let service: BookContextService;

  beforeEach(() => {
    sessions = { getRecentMessages: jest.fn().mockResolvedValue([]) };
    planner = { plan: jest.fn().mockResolvedValue(plan()) };
    retriever = { retrieve: jest.fn().mockResolvedValue([]) };
    memory = {
      buildBookAgentContext: jest.fn().mockResolvedValue({
        text: '',
        recalledMemoryIds: [],
      }),
    };
    externalResearch = { search: jest.fn().mockResolvedValue([]) };
    service = new BookContextService(
      sessions as unknown as BookSessionsService,
      planner as unknown as BookContextPlannerService,
      retriever as unknown as BookChunkRetrieverService,
      memory as unknown as MemoryService,
      externalResearch as unknown as ExternalResearchService,
    );
  });

  it('plans first and then executes bounded scoped retrieval', async () => {
    sessions.getRecentMessages.mockResolvedValue([
      { role: 'user', content: '上一条问题' },
    ]);

    await service.build(context(), '谁出现了？');

    expect(planner.plan).toHaveBeenCalledWith({
      bookTitle: '长夜行',
      query: '谁出现了？',
      recentMessages: [{ role: 'user', content: '上一条问题' }],
      abortSignal: undefined,
    });
    expect(retriever.retrieve).toHaveBeenCalledWith(context().boundary, {
      queries: ['谁出现了？'],
      limit: 4,
      maxContextChars: 3_600,
      maxPerSection: 4,
    });
    expect(memory.buildBookAgentContext).not.toHaveBeenCalled();
    expect(externalResearch.search).not.toHaveBeenCalled();
  });

  it('loads only the memory scope selected by the plan', async () => {
    planner.plan.mockResolvedValue(
      plan({
        memoryPolicy: 'book_notes',
        memoryLimit: 5,
        memoryQuery: '我的笔记',
      }),
    );

    await service.build(context(), '结合我的笔记分析');

    expect(memory.buildBookAgentContext).toHaveBeenCalledWith(
      'user-a',
      'session-a',
      'book-a',
      '我的笔记',
      5,
      'book_notes',
    );
  });

  it('does not call retrieval sources for a social plan', async () => {
    planner.plan.mockResolvedValue(
      plan({
        intent: 'social',
        mode: 'none',
        bookQueries: [],
        bookLimit: 0,
        maxBookContextChars: 0,
        maxChunksPerSection: 0,
        historyPolicy: 'none',
      }),
    );

    const result = await service.build(context(), '你好');

    expect(retriever.retrieve).not.toHaveBeenCalled();
    expect(memory.buildBookAgentContext).not.toHaveBeenCalled();
    expect(result.retrieved).toEqual([]);
    expect(result.memoryContext).toEqual({ text: '', recalledMemoryIds: [] });
    expect(result.externalResearch).toEqual({
      requested: false,
      sources: [],
      failed: false,
    });
  });

  it('keeps book retrieval usable when optional memory recall fails', async () => {
    planner.plan.mockResolvedValue(
      plan({ memoryPolicy: 'preferences', memoryLimit: 3 }),
    );
    memory.buildBookAgentContext.mockRejectedValue(new Error('unavailable'));

    const result = await service.build(context(), '按我的偏好回答');

    expect(result.memoryContext).toEqual({ text: '', recalledMemoryIds: [] });
    expect(retriever.retrieve).toHaveBeenCalledTimes(1);
  });

  it('calls external research only when the user explicitly enables it', async () => {
    externalResearch.search.mockResolvedValue([
      {
        title: '典故来源',
        url: 'https://example.com/source',
        snippet: '这是一段现实背景资料。',
      },
    ]);

    const result = await service.build(context(), '查一下这个典故', {
      externalResearch: true,
    });

    expect(externalResearch.search).toHaveBeenCalledWith(
      '《长夜行》 查一下这个典故',
      undefined,
    );
    expect(result.externalResearch).toEqual({
      requested: true,
      sources: [expect.objectContaining({ url: 'https://example.com/source' })],
      failed: false,
    });
  });

  it('keeps scoped book retrieval usable when external research fails', async () => {
    externalResearch.search.mockRejectedValue(new Error('provider failed'));

    const result = await service.build(context(), '查一下现实背景', {
      externalResearch: true,
    });

    expect(retriever.retrieve).toHaveBeenCalledTimes(1);
    expect(result.externalResearch).toEqual({
      requested: true,
      sources: [],
      failed: true,
    });
  });

  it('stops before planning when the client has already disconnected', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      service.build(context(), '谁出现了？', {
        abortSignal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(planner.plan).not.toHaveBeenCalled();
    expect(retriever.retrieve).not.toHaveBeenCalled();
  });

  function plan(overrides: Partial<BookContextPlan> = {}): BookContextPlan {
    return {
      intent: 'book_lookup',
      mode: 'focused',
      plannerSource: 'rule',
      reasonCode: 'focused_lookup',
      bookQueries: ['谁出现了？'],
      bookLimit: 4,
      maxBookContextChars: 3_600,
      maxChunksPerSection: 4,
      memoryQuery: '谁出现了？',
      memoryPolicy: 'none',
      memoryLimit: 0,
      historyPolicy: 'recent',
      conversationMessages: [],
      ...overrides,
    };
  }

  function context(): BookChatContext {
    return {
      ownerId: 'user-a',
      sessionId: 'session-a',
      assistantId: 'assistant-a',
      bookId: 'book-a',
      bookTitle: '长夜行',
      assistantName: '《长夜行》阅读助手',
      responseDepth: AssistantResponseDepth.BALANCED,
      tone: AssistantTone.NATURAL,
      customInstruction: null,
      boundary: {
        ownerScope: 'user-a',
        bookId: 'book-a',
        embeddingVersion: 'book-embedding-v1',
        spoilerCeiling: 2,
      },
    };
  }
});
