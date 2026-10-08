import { ConfigService } from '@nestjs/config';
import { AIMessageChunk } from '@langchain/core/messages';
import { AgenticBookService } from './agentic-book.service';
import { AgenticBookToolsService } from './agentic-book-tools.service';
import { BookContextPlannerService } from './book-context-planner.service';
import { BookAssistantPromptService } from '../books/book-assistant-prompt.service';
import {
  BookSessionsService,
  type BookChatContext,
} from './book-sessions.service';
import type { BookChatEvent } from './book-chat.service';

const context: BookChatContext = {
  ownerId: 'fixture-owner',
  sessionId: 'fixture-session',
  bookId: 'fixture-book',
  assistantId: 'fixture-assistant',
  bookTitle: '合成小说',
  assistantName: '书魂',
  responseDepth: 'DEEP',
  tone: 'NATURAL',
  customInstruction: null,
  boundary: {
    ownerScope: 'fixture-owner',
    bookId: 'fixture-book',
    embeddingVersion: 'v1',
    spoilerCeiling: 2,
  },
};

describe('Agentic intent precedes retrieval', () => {
  const setup = () => {
    const config = { get: jest.fn() } as unknown as ConfigService;
    const planner = new BookContextPlannerService(config);
    const classify = jest.spyOn(planner, 'planRules');
    const execute = jest
      .fn()
      .mockResolvedValue({ code: 'NOT_FOUND', book: [] });
    const history = [
      { role: 'user', content: '合成人物是什么关系' },
      { role: 'assistant', content: '已解释合成人物关系。' },
    ];
    const service = new AgenticBookService(
      {
        resolve: jest.fn().mockResolvedValue(context),
        getRecentMessages: jest.fn().mockResolvedValue(history),
      } as unknown as BookSessionsService,
      planner,
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
      config,
    );
    const stream = jest.fn(async function* () {
      yield new AIMessageChunk('好的。');
    });
    Object.assign(service, {
      model: { stream, bindTools: () => ({ stream }) },
    });
    const collect = async (query: string) => {
      const events: BookChatEvent[] = [];
      for await (const event of service.run(context, query, {}))
        events.push(event);
      return events;
    };
    return { classify, execute, stream, collect };
  };

  it.each([
    '了解了',
    '这下我搞懂了',
    '你的解释已经够了',
    '谢谢',
    '我的偏好刚才已经说清楚了',
  ])(
    'lets the model finish %s without a rule-triggered lookup',
    async (query) => {
      const { classify, execute, stream, collect } = setup();
      const events = await collect(query);
      expect(classify).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
      expect(stream).toHaveBeenCalledTimes(2);
      expect(events).toContainEqual({ type: 'content', data: '好的。' });
      const messages = stream.mock.calls[0][0];
      expect(
        messages.some((m: { content: unknown }) =>
          String(m.content).includes('已解释合成人物关系'),
        ),
      ).toBe(true);
    },
  );

  it('executes a scoped search only after a native request, even when the wording looks social', async () => {
    const { execute, stream, collect } = setup();
    const order: string[] = [];
    stream.mockImplementationOnce(async function* () {
      order.push('intent');
      yield new AIMessageChunk({
        content: '',
        tool_calls: [
          {
            name: 'book_search',
            args: { queries: ['合成人物动机'] },
            id: 'search-1',
          },
        ],
      });
    });
    execute.mockImplementation(async () => {
      order.push('search');
      return { code: 'NOT_FOUND', book: [] };
    });
    await collect('好的，继续解释他为什么这样做');
    expect(order).toEqual(['intent', 'search']);
    expect(execute).toHaveBeenCalledWith(
      context,
      '好的，继续解释他为什么这样做',
      'book_search',
      { queries: ['合成人物动机'] },
      expect.any(Object),
      expect.any(AbortSignal),
      undefined,
    );
    expect(stream).toHaveBeenCalledTimes(2);
  });
});
