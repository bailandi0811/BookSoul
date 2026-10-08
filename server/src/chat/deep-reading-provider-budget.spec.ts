import { createDeepReadingBudgetedFetch } from '../../test/deep-reading-provider-budget';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
describe('test provider transport budget', () => {
  it('counts real SDK chat attempts and rejects before an excess transport', async () => {
    const transport = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'fixture',
          object: 'chat.completion',
          created: 1,
          model: 'fixture',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'fixture' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const record = jest.fn();
    const budgeted = createDeepReadingBudgetedFetch(
      transport,
      'https://provider.invalid/v1',
      { maxChatCalls: 1, maxEmbeddingTexts: 3 },
      record,
    );
    const model = new ChatOpenAI({
      apiKey: 'fixture',
      model: 'fixture',
      maxRetries: 0,
      configuration: {
        baseURL: 'https://provider.invalid/v1',
        fetch: budgeted,
      },
    });
    await model.invoke('fixture');
    await expect(model.invoke('fixture')).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenLastCalledWith({
      chatCalls: 1,
      embeddingTexts: 0,
      providerAttempts: 1,
    });
  });
  it('counts actual SDK batch splitting and does not leak request data', async () => {
    const transport = jest
      .fn()
      .mockImplementation((_url: unknown, init: RequestInit) => {
        const input = (JSON.parse(String(init.body)) as { input: string[] })
          .input;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: input.map((_text, index) => ({ index, embedding: [1, 0] })),
              usage: { prompt_tokens: 1, total_tokens: 1 },
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
      });
    const record = jest.fn();
    const budgeted = createDeepReadingBudgetedFetch(
      transport,
      'https://provider.invalid/v1',
      { maxChatCalls: 1, maxEmbeddingTexts: 3 },
      record,
    );
    const model = new OpenAIEmbeddings({
      apiKey: 'fixture',
      model: 'fixture',
      batchSize: 1,
      maxRetries: 0,
      configuration: {
        baseURL: 'https://provider.invalid/v1',
        fetch: budgeted,
      },
    });
    await model.embedDocuments(['synthetic-a', 'synthetic-b', 'synthetic-c']);
    expect(transport).toHaveBeenCalledTimes(3);
    expect(record).toHaveBeenLastCalledWith({
      chatCalls: 0,
      embeddingTexts: 3,
      providerAttempts: 3,
    });
    expect(JSON.stringify(record.mock.calls)).not.toContain('synthetic');
  });
  it('rejects unapproved destinations without any transport', async () => {
    const transport = jest.fn();
    const budgeted = createDeepReadingBudgetedFetch(
      transport,
      'https://provider.invalid/v1',
      { maxChatCalls: 1, maxEmbeddingTexts: 3 },
      jest.fn(),
    );
    await expect(
      budgeted('https://other.invalid/v1/chat/completions', { body: '{}' }),
    ).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
});
