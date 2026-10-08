import { ConfigService } from '@nestjs/config';
import { BookChatService } from './book-chat.service';
import type { BookChatEvent } from './book-chat.service';
import { BookSessionsService } from './book-sessions.service';
import { BookContextService } from './book-context.service';
import { BookAssistantPromptService } from '../books/book-assistant-prompt.service';
import { MemoryService } from '../memory/memory.service';
import { ExternalResearchService } from './external-research.service';
import { AgenticBookService } from './agentic-book.service';
import { BookContextPlannerService } from './book-context-planner.service';
import { AgenticBookToolsService } from './agentic-book-tools.service';
import { AIMessageChunk } from '@langchain/core/messages';
import type { BookChatContext } from './book-sessions.service';

const context: BookChatContext = {
  ownerId: 'owner',
  sessionId: 'session',
  assistantId: 'assistant',
  bookId: 'book',
  bookTitle: '合成小说',
  assistantName: '书魂',
  responseDepth: 'DEEP',
  tone: 'NATURAL',
  customInstruction: null,
  boundary: {
    ownerScope: 'owner',
    bookId: 'book',
    embeddingVersion: 'v1',
    spoilerCeiling: 2,
  },
};
describe('deep chat integration', () => {
  let service: BookChatService;
  let sessions: {
    resolve: jest.Mock;
    getRecentMessages: jest.Mock;
    appendExchange: jest.Mock;
  };
  let quick: { build: jest.Mock };
  let memory: { processAndStoreBookMemory: jest.Mock };
  let stream: jest.Mock;
  beforeEach(() => {
    sessions = {
      resolve: jest.fn().mockResolvedValue(context),
      getRecentMessages: jest.fn().mockResolvedValue([]),
      appendExchange: jest.fn().mockResolvedValue(undefined),
    };
    quick = { build: jest.fn() };
    memory = { processAndStoreBookMemory: jest.fn() };
    const config = { get: jest.fn() } as unknown as ConfigService;
    const deep = new AgenticBookService(
      sessions as unknown as BookSessionsService,
      new BookContextPlannerService(config),
      {
        createTools: jest.fn().mockReturnValue([]),
      } as unknown as AgenticBookToolsService,
      new BookAssistantPromptService(),
      config,
    );
    service = new BookChatService(
      sessions as unknown as BookSessionsService,
      quick as unknown as BookContextService,
      new BookAssistantPromptService(),
      memory as unknown as MemoryService,
      {} as ExternalResearchService,
      { get: jest.fn() } as unknown as ConfigService,
      deep,
    );
    stream = jest.fn(async function* () {
      yield new AIMessageChunk('目前可见原文没有依据。');
    });
    Object.assign(deep, { model: { stream, bindTools: () => ({ stream }) } });
  });
  async function collect(signal?: AbortSignal) {
    const events: BookChatEvent[] = [];
    for await (const e of service.stream(context, '问题', {
      retrievalMode: 'deep',
      abortSignal: signal,
    }))
      events.push(e);
    return events;
  }
  it('uses Agentic mode and gates only the original user message', async () => {
    const events = await collect();
    expect(events).toContainEqual({
      type: 'content',
      data: '目前可见原文没有依据。',
    });
    expect(events.some((event) => event.type === 'run_summary')).toBe(false);
    expect(stream).toHaveBeenCalledTimes(2);
    expect(quick.build).not.toHaveBeenCalled();
    expect(memory.processAndStoreBookMemory).toHaveBeenCalledWith(
      'owner',
      'session',
      'book',
      '问题',
      expect.any(AbortSignal),
    );
    expect(sessions.appendExchange).toHaveBeenCalledTimes(1);
  });
  it('rejects index or ceiling change before final model', async () => {
    sessions.resolve.mockResolvedValue({
      ...context,
      boundary: { ...context.boundary, embeddingVersion: 'v2' },
    });
    await expect(collect()).rejects.toMatchObject({
      code: 'BOOK_CONTEXT_CHANGED',
    });
    expect(stream).not.toHaveBeenCalled();
    sessions.resolve.mockResolvedValue({
      ...context,
      boundary: { ...context.boundary, spoilerCeiling: 1 },
    });
    await expect(collect()).rejects.toMatchObject({
      code: 'BOOK_CONTEXT_CHANGED',
    });
  });
  it('allows progress increase without expanding frozen retrieval scope', async () => {
    sessions.resolve.mockResolvedValue({
      ...context,
      boundary: { ...context.boundary, spoilerCeiling: 4 },
    });
    await collect();
    expect(stream).toHaveBeenCalledTimes(2);
  });
  it('does not persist cancelled generation', async () => {
    const controller = new AbortController();
    stream.mockImplementation(async function* () {
      controller.abort();
      yield new AIMessageChunk('late');
    });
    await expect(collect(controller.signal)).rejects.toThrow();
    expect(sessions.appendExchange).not.toHaveBeenCalled();
    expect(memory.processAndStoreBookMemory).not.toHaveBeenCalled();
  });
  it('reports explicit memory save only after the gate has completed', async () => {
    memory.processAndStoreBookMemory.mockResolvedValue({
      hasNewMemories: true,
      memoryCount: 1,
      confirmedCount: 1,
    });
    const events: BookChatEvent[] = [];
    // Keep this test focused on the chat commit contract; the Agent loop has separate recall tests.
    Object.assign(service, {
      agentic: {
        run: async function* () {
          yield { type: 'content', data: '偏好已理解。' };
        },
      },
    });
    for await (const event of service.stream(context, '请记住以后回答要简洁', {
      retrievalMode: 'deep',
    }))
      events.push(event);
    expect(memory.processAndStoreBookMemory).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual({
      type: 'content',
      data: '\n已保存本次记忆。',
    });
    expect(events.some((e) => e.type === 'memory_update')).toBe(true);
    memory.processAndStoreBookMemory.mockRejectedValue(
      new Error('synthetic failure'),
    );
    const failed: BookChatEvent[] = [];
    for await (const event of service.stream(context, '请记住以后回答要简洁', {
      retrievalMode: 'deep',
    }))
      failed.push(event);
    expect(failed.some((e) => e.type === 'memory_update')).toBe(false);
    expect(failed).toContainEqual({
      type: 'content',
      data: '\n本次记忆保存未完成，请稍后重试。',
    });
  });

  it('closes a cancelled provider iterator without starting another next', async () => {
    const controller = new AbortController();
    const cleanup = jest.fn().mockResolvedValue({ done: true });
    const next = jest.fn().mockImplementation(() => {
      controller.abort();
      return Promise.resolve({
        done: false,
        value: new AIMessageChunk('late'),
      });
    });
    stream.mockResolvedValue({
      [Symbol.asyncIterator]: () => ({ next, return: cleanup }),
    });
    await expect(collect(controller.signal)).rejects.toThrow();
    expect(next).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
