import { ConfigService } from '@nestjs/config';
import { AIMessageChunk } from '@langchain/core/messages';
import { NotFoundException } from '@nestjs/common';
import { AgenticBookService } from './agentic-book.service';
import type { BookChatEvent } from './book-chat.service';
import { BookSessionsService } from './book-sessions.service';
import { BookContextPlannerService } from './book-context-planner.service';
import { AgenticBookToolsService } from './agentic-book-tools.service';
import type { RetrievedBookChunk } from './book-chunk-retriever.service';
import { BookAssistantPromptService } from '../books/book-assistant-prompt.service';
import type { BookChatContext } from './book-sessions.service';
const agentContext: BookChatContext = {
  ownerId: 'fixture-owner',
  sessionId: 'fixture-session',
  assistantId: 'fixture-assistant',
  bookId: 'fixture-book',
  bookTitle: '合成',
  assistantName: '书魂',
  responseDepth: 'BALANCED',
  tone: 'NATURAL',
  customInstruction: null,
  boundary: {
    ownerScope: 'fixture-owner',
    bookId: 'fixture-book',
    embeddingVersion: 'v1',
    spoilerCeiling: 2,
  },
};

const chunk = (id: string): RetrievedBookChunk => ({
  bookId: 'fixture-book',
  sectionId: 's1',
  sectionOrder: 1,
  sectionTitle: '合成章节',
  chunkId: id,
  chunkIndex: 0,
  content: `合成证据 ${id}`,
  excerpt: `合成证据 ${id}`,
  score: 1,
});
describe('AgenticBookService', () => {
  let service: AgenticBookService;
  let execute: jest.Mock;
  let stream: jest.Mock;
  let bindTools: jest.Mock;
  let resolve: jest.Mock;
  beforeEach(() => {
    execute = jest.fn().mockResolvedValue({ code: 'OK', book: [chunk('b')] });
    resolve = jest.fn().mockResolvedValue(agentContext);
    service = new AgenticBookService(
      {
        getRecentMessages: jest.fn().mockResolvedValue([]),
        resolve,
      } as unknown as BookSessionsService,
      new BookContextPlannerService({
        get: jest.fn(),
      } as unknown as ConfigService),
      {
        createTools: jest
          .fn()
          .mockReturnValue([
            { name: 'book_search' },
            { name: 'memory_recall' },
          ]),
        execute,
      } as unknown as AgenticBookToolsService,
      new BookAssistantPromptService(),
      { get: jest.fn() } as unknown as ConfigService,
    );
    stream = jest.fn(async function* () {
      yield new AIMessageChunk('有原文依据的合成回答');
    });
    bindTools = jest.fn().mockImplementation(() => ({ stream }));
    Object.assign(service, { model: { stream, bindTools } });
  });
  const collect = async (signal?: AbortSignal) => {
    const events: BookChatEvent[] = [];
    for await (const event of service.run(agentContext, '主角是谁', {
      abortSignal: signal,
      retrievalMode: 'deep',
    }))
      events.push(event);
    return events;
  };
  const requestSearch = (queries: string[], id: string) =>
    async function* () {
      yield new AIMessageChunk({
        content: '',
        tool_calls: [{ name: 'book_search', args: { queries }, id }],
      });
    };
  it('keeps the actual question as the last human message in decision and final turns', async () => {
    await collect();
    for (const [messages] of stream.mock.calls) {
      const human = messages.filter(
        (message: { getType: () => string }) => message.getType() === 'human',
      );
      expect(human.at(-1).content).toBe('主角是谁');
      expect(messages[0].content).toContain('不要展示证据容器');
    }
  });
  it('uses the server-approved full-book ceiling for search, prompts and revalidation', async () => {
    const context = {
      ...agentContext,
      boundary: { ...agentContext.boundary, spoilerCeiling: 42 },
    };
    resolve.mockResolvedValue(context);
    execute.mockResolvedValue({
      code: 'OK',
      book: [{ ...chunk('later'), sectionOrder: 42 }],
    });
    stream.mockImplementationOnce(
      requestSearch(['合成人物 后文实力'], 'later-search'),
    );
    const events: BookChatEvent[] = [];
    for await (const event of service.run(context, '合成人物后文实力如何', {
      retrievalMode: 'deep',
      spoilerOverride: true,
    }))
      events.push(event);
    expect(execute.mock.calls[0][0].boundary.spoilerCeiling).toBe(42);
    expect(resolve.mock.calls.every((args) => args[2] === true)).toBe(true);
    for (const [messages] of stream.mock.calls)
      expect(messages[0].content).toContain('本轮允许检索和引用第 1—42 节');
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'references',
        data: expect.arrayContaining([
          expect.objectContaining({ sectionOrder: 42 }),
        ]),
      }),
    );
  });
  it('still rejects later-section evidence without a server-approved full-book boundary', async () => {
    execute.mockResolvedValue({
      code: 'OK',
      book: [{ ...chunk('later'), sectionOrder: 42 }],
    });
    stream.mockImplementationOnce(requestSearch(['后文'], 'later-denied'));
    await expect(collect()).rejects.toMatchObject({
      code: 'BOOK_CONTEXT_CHANGED',
    });
  });
  it('emits answer chunks before requesting the next provider chunk', async () => {
    let advanced = false;
    stream.mockImplementation(async function* () {
      yield new AIMessageChunk('第一段');
      advanced = true;
      yield new AIMessageChunk('第二段');
    });
    stream.mockImplementationOnce(async function* () {
      yield new AIMessageChunk('不展示的候选回答');
    });
    const run = service.run(agentContext, '你好', { retrievalMode: 'deep' });
    let first = await run.next();
    while (!first.done && first.value.type !== 'content')
      first = await run.next();
    expect(first.value).toEqual({ type: 'content', data: '第一段' });
    expect(advanced).toBe(false);
    expect((await run.next()).value).toEqual({
      type: 'content',
      data: '第二段',
    });
    expect((await run.next()).done).toBe(true);
  });
  it('rejects a tool call arriving after answer text without executing or storing that tool turn', async () => {
    stream.mockImplementationOnce(async function* () {
      yield new AIMessageChunk('private candidate');
    });
    stream.mockImplementationOnce(async function* () {
      yield new AIMessageChunk('第一段');
      yield new AIMessageChunk({
        content: '',
        tool_calls: [
          { name: 'book_search', args: { queries: ['不应执行'] }, id: 'late' },
        ],
      });
    });
    const events: BookChatEvent[] = [];
    const running = async () => {
      for await (const event of service.run(agentContext, '合成请求', {}))
        events.push(event);
    };
    await expect(running()).rejects.toMatchObject({
      code: 'DEEP_MODE_OUTPUT_INVALID',
      diagnostic: { reason: 'tool_calls_invalid' },
    });
    expect(execute).not.toHaveBeenCalled();
    expect(events.filter((event) => event.type === 'content')).toEqual([
      { type: 'content', data: '第一段' },
    ]);
  });
  it('stops streaming when the reading ceiling shrinks between answer chunks', async () => {
    stream.mockImplementationOnce(async function* () {
      yield new AIMessageChunk('ready');
    });
    stream.mockImplementationOnce(async function* () {
      yield new AIMessageChunk('可见回答');
      resolve.mockResolvedValue({
        ...agentContext,
        boundary: { ...agentContext.boundary, spoilerCeiling: 1 },
      });
      yield new AIMessageChunk('不得继续展示');
    });
    const events: BookChatEvent[] = [];
    const running = async () => {
      for await (const event of service.run(agentContext, '问题', {}))
        events.push(event);
    };
    await expect(running()).rejects.toMatchObject({
      code: 'BOOK_CONTEXT_CHANGED',
    });
    expect(events.filter((event) => event.type === 'content')).toEqual([
      { type: 'content', data: '可见回答' },
    ]);
  });
  it('answers simple lookup with one retrieval, a decision and a streamed final turn', async () => {
    stream.mockImplementationOnce(requestSearch(['主角是谁'], 'lookup'));
    const events = await collect();
    expect(stream).toHaveBeenCalledTimes(3);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual({
      type: 'content',
      data: '有原文依据的合成回答',
    });
  });
  it('uses no book search for social questions', async () => {
    for await (const _event of service.run(agentContext, '你好', {})) {
      void _event;
    }
    expect(bindTools).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
    expect(stream).toHaveBeenCalledTimes(2);
  });
  it('preserves trusted tool scope and caps book searches at three', async () => {
    stream
      .mockImplementationOnce(async function* () {
        yield new AIMessageChunk({
          content: '',
          tool_calls: [
            { name: 'book_search', args: { queries: ['q2'] }, id: 'c2' },
          ],
        });
      })
      .mockImplementationOnce(async function* () {
        yield new AIMessageChunk({
          content: '',
          tool_calls: [
            { name: 'book_search', args: { queries: ['q3'] }, id: 'c3' },
          ],
        });
      })
      .mockImplementationOnce(async function* () {
        yield new AIMessageChunk({
          content: '',
          tool_calls: [
            { name: 'book_search', args: { queries: ['q4'] }, id: 'c4' },
          ],
        });
      });
    execute
      .mockResolvedValueOnce({
        code: 'OK',
        book: [{ ...chunk('b'), sectionId: 's2', sectionOrder: 2 }],
      })
      .mockResolvedValueOnce({ code: 'OK', book: [chunk('c')] });
    const events = await collect();
    expect(execute).toHaveBeenCalledTimes(3);
    expect(stream).toHaveBeenCalledTimes(4);
    expect(execute.mock.calls.every((call) => call[0] === agentContext)).toBe(
      true,
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'run_summary',
        data: expect.objectContaining({ retrievalRounds: 3 }),
      }),
    );
  });
  it('repairs multiple calls once without executing either and then disables tools', async () => {
    const calls = [
      { name: 'book_search', args: { queries: ['next'] }, id: 'one' },
      {
        name: 'memory_recall',
        args: { query: '偏好', policy: 'preferences' },
        id: 'two',
      },
    ];
    stream.mockImplementationOnce(async function* () {
      yield new AIMessageChunk({ content: 'hidden', tool_calls: calls });
    });
    stream.mockImplementationOnce(async function* () {
      yield new AIMessageChunk({
        content: '',
        tool_calls: calls.map((c) => ({ ...c, id: c.id + '2' })),
      });
    });
    await collect();
    expect(execute).not.toHaveBeenCalled();
    expect(bindTools).toHaveBeenCalledTimes(2);
    expect(stream).toHaveBeenCalledTimes(3);
    expect(
      stream.mock.calls[1][0].filter(
        (m: { getType: () => string }) => m.getType() === 'tool',
      ),
    ).toHaveLength(2);
  });
  it('rejects changed READY state at retrieval and propagates other retrieval failures', async () => {
    stream.mockImplementationOnce(requestSearch(['原文'], 'lookup-1'));
    execute.mockRejectedValue(new NotFoundException());
    await expect(collect()).rejects.toMatchObject({
      code: 'BOOK_CONTEXT_CHANGED',
    });
    expect(stream).toHaveBeenCalledTimes(1);
    stream.mockImplementationOnce(requestSearch(['原文'], 'lookup-2'));
    execute.mockRejectedValue(new Error('synthetic fault'));
    await expect(collect()).rejects.toThrow('synthetic fault');
  });
  it('labels a nonabortable requested search timeout with its actual stage', async () => {
    jest.useFakeTimers();
    try {
      stream.mockImplementationOnce(requestSearch(['原文'], 'search'));
      execute.mockReturnValue(new Promise(() => undefined));
      const pending = collect().catch((error: unknown) => error);
      await jest.advanceTimersByTimeAsync(90000);
      expect(await pending).toMatchObject({
        code: 'DEEP_MODE_TIMEOUT',
        diagnostic: { stage: 'book_search' },
      });
      expect(stream).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
  it('deduplicates overlapping excerpts and ranks new evidence without cross-round scores', async () => {
    execute.mockResolvedValueOnce({
      code: 'OK',
      book: Array.from({ length: 8 }, (_, i) => ({
        ...chunk('a' + i),
        sectionId: 's' + (i % 2),
        startOffset: i * 100,
        endOffset: i * 100 + 50,
      })),
    });
    execute.mockResolvedValue({
      code: 'OK',
      book: [
        {
          ...chunk('new'),
          sectionId: 's2',
          score: -999,
          startOffset: 0,
          endOffset: 50,
        },
      ],
    });
    stream.mockImplementationOnce(requestSearch(['原文'], 'initial'));
    stream.mockImplementationOnce(async function* () {
      yield new AIMessageChunk({
        content: '',
        tool_calls: [
          {
            name: 'book_search',
            args: { queries: ['new evidence'] },
            id: 'new-call',
          },
        ],
      });
    });
    const events = await collect();
    const refs = events.find((e) => e.type === 'references');
    expect(refs?.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ chunkId: 'new' })]),
    );
  });
  it('only supplements when the native model requests search and hides intermediate text', async () => {
    stream.mockImplementationOnce(async function* () {
      yield new AIMessageChunk({
        content: '不能展示的中间文字',
        tool_calls: [
          {
            name: 'book_search',
            args: { queries: ['补充依据'] },
            id: 'call-1',
          },
        ],
      });
    });
    const events = await collect();
    expect(stream).toHaveBeenCalledTimes(3);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(events.filter((e) => e.type === 'content')).toEqual([
      { type: 'content', data: '有原文依据的合成回答' },
    ]);
    expect(
      stream.mock.calls[1][0].some((message: { content: unknown }) =>
        String(message.content).includes('合成证据 b'),
      ),
    ).toBe(true);
  });
  it('does not kill an eight second response at the old five second deadline', async () => {
    jest.useFakeTimers();
    try {
      stream.mockImplementation(async function* () {
        await new Promise((r) => setTimeout(r, 8000));
        yield new AIMessageChunk('answer');
      });
      const running = collect();
      await jest.advanceTimersByTimeAsync(16000);
      await expect(running).resolves.toContainEqual({
        type: 'content',
        data: 'answer',
      });
    } finally {
      jest.useRealTimers();
    }
  });
  it('reserves the final answer window after a slow model turn', async () => {
    jest.useFakeTimers();
    try {
      const start = Date.now();
      stream.mockImplementationOnce(async function* () {
        jest.setSystemTime(start + 61000);
        yield new AIMessageChunk({
          content: '',
          tool_calls: [
            {
              name: 'book_search',
              args: { queries: ['supplement'] },
              id: 'late',
            },
          ],
        });
      });
      await collect();
      expect(execute).not.toHaveBeenCalled();
      expect(bindTools).toHaveBeenCalledTimes(1);
      expect(stream).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
  it('stops repeat searches without another tool execution', async () => {
    stream.mockImplementation(async function* () {
      yield new AIMessageChunk({
        content: '',
        tool_calls: [
          {
            name: 'book_search',
            args: { queries: ['主角是谁'] },
            id: 'repeat',
          },
        ],
      });
    });
    stream.mockImplementationOnce(async function* () {
      yield new AIMessageChunk({
        content: '',
        tool_calls: [
          {
            name: 'book_search',
            args: { queries: ['主角是谁'] },
            id: 'repeat',
          },
        ],
      });
    });
    stream.mockImplementationOnce(requestSearch(['主角是谁'], 'repeat-2'));
    // A duplicate request is rejected before the final answer turn.
    stream.mockImplementationOnce(async function* () {
      yield new AIMessageChunk('依据有限');
    });
    const events = await collect();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'run_summary',
        data: expect.objectContaining({ stopReason: 'no_queries' }),
      }),
    );
  });
  it('rejects unpermitted native tools and context shrink before exposing an answer', async () => {
    stream.mockImplementationOnce(async function* () {
      yield new AIMessageChunk({
        content: '',
        tool_calls: [
          { name: 'request_external_research', args: {}, id: 'forbidden' },
        ],
      });
    });
    await expect(collect()).rejects.toMatchObject({
      code: 'DEEP_MODE_OUTPUT_INVALID',
    });
    expect(execute).not.toHaveBeenCalled();
    stream.mockImplementation(async function* () {
      resolve.mockResolvedValue({
        ...agentContext,
        boundary: { ...agentContext.boundary, spoilerCeiling: 1 },
      });
      yield new AIMessageChunk('late answer');
    });
    await expect(collect()).rejects.toMatchObject({
      code: 'BOOK_CONTEXT_CHANGED',
    });
  });
  it('rejects a truncated provider answer before displaying it', async () => {
    stream.mockImplementation(async function* () {
      yield new AIMessageChunk({
        content: 'partial',
        response_metadata: { finish_reason: 'length' },
      });
    });
    await expect(collect()).rejects.toMatchObject({
      code: 'DEEP_MODE_OUTPUT_INVALID',
      diagnostic: { stage: 'agent', reason: 'output_truncated' },
    });
    expect(stream).toHaveBeenCalledTimes(1);
  });
  it('discards cancelled provider output and closes its iterator', async () => {
    const controller = new AbortController();
    const cleanup = jest.fn().mockResolvedValue({ done: true });
    stream.mockResolvedValue({
      [Symbol.asyncIterator]: () => ({
        next: jest.fn(() => {
          controller.abort();
          return Promise.resolve({
            done: false,
            value: new AIMessageChunk('late'),
          });
        }),
        return: cleanup,
      }),
    });
    await expect(collect(controller.signal)).rejects.toThrow();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('reports the active failed stage without logging user text or tool arguments', async () => {
    jest.useFakeTimers();
    const warn = jest
      .spyOn(
        (service as unknown as { logger: { warn: (message: string) => void } })
          .logger,
        'warn',
      )
      .mockImplementation(() => undefined);
    try {
      stream.mockResolvedValue({
        [Symbol.asyncIterator]: () => ({
          next: () => new Promise(() => undefined),
          return: async () => ({ done: true }),
        }),
      });
      const running = collect().catch((error: unknown) => error);
      await jest.advanceTimersByTimeAsync(20000);
      expect(await running).toMatchObject({
        code: 'DEEP_MODE_TIMEOUT',
        diagnostic: { stage: 'agent' },
      });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('stage=agent'));
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('modelCalls=1'),
      );
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('searches=0'));
      expect(warn.mock.calls.flat().join(' ')).not.toContain('主角是谁');
    } finally {
      warn.mockRestore();
      jest.useRealTimers();
    }
  });
});
