import { ConfigService } from '@nestjs/config';
import { BookEmbeddingService } from './book-embedding.service';

describe('BookEmbeddingService', () => {
  let service: BookEmbeddingService;
  let embedDocuments: jest.Mock;

  beforeEach(() => {
    service = new BookEmbeddingService({
      get: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          'books.embeddingBatchSize': 2,
          'books.embeddingMaxAttempts': 2,
          'books.embeddingRetryBaseMs': 0,
          'milvus.vectorDim': 3,
          'openai.embeddingModel': 'test-embedding',
        };
        return values[key];
      }),
    } as unknown as ConfigService);
    embedDocuments = jest.fn();
    Object.assign(service, { client: { embedDocuments } });
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
});
