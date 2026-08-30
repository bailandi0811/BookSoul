import { ConfigService } from '@nestjs/config';
import { BookEmbeddingService } from './book-embedding.service';

describe('BookEmbeddingService', () => {
  let service: BookEmbeddingService;
  let embedDocuments: jest.Mock;

  function createService(overrides: Record<string, unknown> = {}) {
    return new BookEmbeddingService({
      get: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          'books.embeddingBatchSize': 2,
          'books.embeddingMaxAttempts': 2,
          'books.embeddingRetryBaseMs': 0,
          'milvus.vectorDim': 3,
          'openai.embeddingModel': 'test-embedding',
          ...overrides,
        };
        return values[key];
      }),
    } as unknown as ConfigService);
  }

  beforeEach(() => {
    service = createService();
    embedDocuments = jest.fn();
    Object.assign(service, { client: { embedDocuments } });
  });

  it('caps DashScope requests at the provider batch limit', () => {
    const dashScopeService = createService({
      'books.embeddingBatchSize': 32,
      'openai.baseUrl':
        'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    expect(
      (
        dashScopeService as unknown as {
          client: { batchSize: number };
        }
      ).client.batchSize,
    ).toBe(10);
  });

  it('returns one validated vector for each input', async () => {
    embedDocuments.mockResolvedValue([
      [1, 0, 0],
      [0, 1, 0],
    ]);

    await expect(service.embedBatch(['片段一', '片段二'])).resolves.toEqual([
      [1, 0, 0],
      [0, 1, 0],
    ]);
  });

  it('retries a transient failure and rejects invalid dimensions safely', async () => {
    embedDocuments
      .mockRejectedValueOnce(new Error('temporary upstream failure'))
      .mockResolvedValueOnce([[1, 2]]);

    await expect(service.embedBatch(['片段'])).rejects.toMatchObject({
      code: 'EMBEDDING_UNAVAILABLE',
      message: '暂时无法生成小说索引，请稍后重试',
    });
    expect(embedDocuments).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-transient provider configuration error', async () => {
    const providerError = Object.assign(new Error('provider detail'), {
      status: 400,
    });
    embedDocuments.mockRejectedValue(providerError);

    await expect(service.embedBatch(['片段'])).rejects.toMatchObject({
      code: 'EMBEDDING_UNAVAILABLE',
      message: '向量模型配置不兼容，请检查模型名称、维度和批次设置',
    });
    expect(embedDocuments).toHaveBeenCalledTimes(1);
  });

  it('retries a transient provider failure', async () => {
    const providerError = Object.assign(new Error('provider detail'), {
      status: 503,
    });
    embedDocuments
      .mockRejectedValueOnce(providerError)
      .mockResolvedValueOnce([[1, 0, 0]]);

    await expect(service.embedBatch(['片段'])).resolves.toEqual([[1, 0, 0]]);
    expect(embedDocuments).toHaveBeenCalledTimes(2);
  });
});
