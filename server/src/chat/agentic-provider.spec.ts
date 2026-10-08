import { ChatOpenAI } from '@langchain/openai';
import { ConfigService } from '@nestjs/config';
import { AgenticBookService } from './agentic-book.service';
import { AgenticBookToolsService } from './agentic-book-tools.service';
import { BookContextPlannerService } from './book-context-planner.service';
import { BookAssistantPromptService } from '../books/book-assistant-prompt.service';
import {
  BookSessionsService,
  type BookChatContext,
} from './book-sessions.service';
import { BookChunkRetrieverService } from './book-chunk-retriever.service';
import { MemoryService } from '../memory/memory.service';
import { BookExternalResearchAgentService } from './book-external-research-agent.service';
import type { BookChatEvent } from './book-chat.service';
const context: BookChatContext = {
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
const sse = (deltas: unknown[]) =>
  new Response(
    deltas
      .map(
        (delta) =>
          'data: ' +
          JSON.stringify({
            id: 'fixture',
            object: 'chat.completion.chunk',
            model: 'fixture',
            choices: [{ index: 0, delta, finish_reason: null }],
          }) +
          '\n\n',
      )
      .join('') + 'data: [DONE]\n\n',
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
describe('native provider transport compatibility', () => {
  const setup = (transport: typeof fetch) => {
    const config = { get: jest.fn() } as unknown as ConfigService;
    const tools = new AgenticBookToolsService(
      {
        retrieve: jest.fn().mockResolvedValue([]),
      } as unknown as BookChunkRetrieverService,
      {} as MemoryService,
      {} as BookExternalResearchAgentService,
    );
    const service = new AgenticBookService(
      {
        resolve: jest.fn().mockResolvedValue(context),
        getRecentMessages: jest.fn().mockResolvedValue([]),
      } as unknown as BookSessionsService,
      new BookContextPlannerService(config),
      tools,
      new BookAssistantPromptService(),
      config,
    );
    Object.assign(service, {
      model: new ChatOpenAI({
        apiKey: 'fixture',
        model: 'fixture',
        maxRetries: 0,
        streaming: true,
        configuration: {
          baseURL: 'https://fixture.invalid/v1',
          fetch: transport,
        },
      }),
    });
    return service;
  };
  it('merges split native arguments and only exposes the tool-free answer', async () => {
    const transport = jest.fn<
      ReturnType<typeof fetch>,
      Parameters<typeof fetch>
    >();
    transport.mockResolvedValueOnce(
      sse([
        {
          role: 'assistant',
          content: 'hidden',
          tool_calls: [
            {
              index: 0,
              id: 'c1',
              type: 'function',
              function: { name: 'book_search', arguments: '{"queries":[' },
            },
          ],
        },
        { tool_calls: [{ index: 0, function: { arguments: '"补充"]}' } }] },
      ]),
    );
    transport.mockResolvedValueOnce(
      sse([{ role: 'assistant', content: '有限依据' }]),
    );
    const events: BookChatEvent[] = [];
    for await (const event of setup(transport).run(context, '主角是谁', {}))
      events.push(event);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(events.filter((e) => e.type === 'content')).toEqual([
      { type: 'content', data: '有限依据' },
    ]);
    const body = JSON.parse(String(transport.mock.calls[0][1]?.body)) as {
      tools: { function: { name: string } }[];
    };
    expect(body.tools.map((t) => t.function.name)).toEqual([
      'book_search',
      'memory_recall',
    ]);
  });
  it('does not retry an incompatible provider or invoke quick mode', async () => {
    const transport = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(
        new Response(
          '{"error":{"message":"synthetic failure","type":"server_error"}}',
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    const running = async () => {
      for await (const _event of setup(transport).run(
        context,
        '主角是谁',
        {},
      )) {
        void _event;
      }
    };
    await expect(running()).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('streams conversation in a separate tool-free final turn', async () => {
    const transport = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockImplementation(async () =>
        sse([{ role: 'assistant', content: '好的。' }]),
      );
    const service = setup(transport);
    const events: BookChatEvent[] = [];
    for await (const event of service.run(context, '了解了', {}))
      events.push(event);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(events).toEqual([{ type: 'content', data: '好的。' }]);
    const body = JSON.parse(String(transport.mock.calls[0][1]?.body)) as {
      tools: { function: { name: string } }[];
      messages: { content: string }[];
    };
    expect(body.tools.map((t) => t.function.name)).toEqual([
      'book_search',
      'memory_recall',
    ]);
    expect(body.messages[0].content).toContain('先理解本轮用户的实际请求');
    const finalBody = JSON.parse(String(transport.mock.calls[1][1]?.body));
    expect(finalBody.tools).toBeUndefined();
  });
});
