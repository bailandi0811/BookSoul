import { AgenticBookToolsService } from './agentic-book-tools.service';
import { BookChunkRetrieverService } from './book-chunk-retriever.service';
import { MemoryService } from '../memory/memory.service';
import { BookExternalResearchAgentService } from './book-external-research-agent.service';
import type { BookChatContext } from './book-sessions.service';
export const agentContext: BookChatContext = {
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
describe('agentic scoped tools', () => {
  const signal = new AbortController().signal;
  const permissions = { externalResearch: false, emailDraft: false };
  let tools: AgenticBookToolsService;
  let retrieve: jest.Mock;
  let recall: jest.Mock;
  let research: jest.Mock;
  beforeEach(() => {
    retrieve = jest.fn().mockResolvedValue([]);
    recall = jest
      .fn()
      .mockResolvedValue({ text: '已确认合成偏好', recalledMemoryIds: ['m'] });
    research = jest
      .fn()
      .mockResolvedValue({
        context: { requested: true, used: false, sources: [], failed: false },
        messages: [],
      });
    tools = new AgenticBookToolsService(
      { retrieve } as unknown as BookChunkRetrieverService,
      { buildBookAgentContext: recall } as unknown as MemoryService,
      { research } as unknown as BookExternalResearchAgentService,
    );
  });
  it('rejects scope injection and unauthorized tools before execution', async () => {
    await expect(
      tools.execute(
        agentContext,
        '问题',
        'book_search',
        { queries: ['谁'], bookId: 'other' },
        permissions,
        signal,
      ),
    ).rejects.toMatchObject({ code: 'DEEP_MODE_OUTPUT_INVALID' });
    await expect(
      tools.execute(
        agentContext,
        '问题',
        'request_external_research',
        {},
        permissions,
        signal,
      ),
    ).rejects.toThrow();
    expect(retrieve).not.toHaveBeenCalled();
    expect(research).not.toHaveBeenCalled();
  });
  it('injects the frozen book scope and recalls current confirmed memory', async () => {
    await tools.execute(
      agentContext,
      '问题',
      'book_search',
      { queries: ['谁'] },
      permissions,
      signal,
    );
    expect(retrieve).toHaveBeenCalledWith(
      agentContext.boundary,
      expect.objectContaining({ embeddingMaxAttempts: 1 }),
      signal,
    );
    await tools.execute(
      agentContext,
      '问题',
      'memory_recall',
      { query: '偏好', policy: 'preferences' },
      permissions,
      signal,
    );
    expect(recall).toHaveBeenCalledWith(
      'fixture-owner',
      'fixture-session',
      'fixture-book',
      '偏好',
      5,
      'preferences',
      signal,
    );
  });
  it('isolates external routing from model generated search terms', async () => {
    await tools.execute(
      agentContext,
      '作者背景',
      'request_external_research',
      {},
      { ...permissions, externalResearch: true },
      signal,
    );
    expect(research).toHaveBeenCalledWith('合成', '作者背景', signal);
    const rejected = await tools.execute(
      agentContext,
      '作者背景',
      'request_external_research',
      { query: 'private text' },
      { ...permissions, externalResearch: true },
      signal,
    );
    expect(rejected.code).toBe('INVALID_TOOL_ARGUMENTS');
    expect(research).toHaveBeenCalledTimes(1);
  });
});
