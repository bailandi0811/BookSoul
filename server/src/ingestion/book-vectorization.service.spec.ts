import { ConfigService } from '@nestjs/config';
import { BookEmbeddingService } from '../vector/book-embedding.service';
import { BookVectorStoreService } from '../vector/book-vector-store.service';
import { BookVectorizationService } from './book-vectorization.service';
import { IngestionError } from './errors/ingestion-error';
import { IngestionJobRepository } from './ingestion-job.repository';
import type {
  BookVectorizationContext,
  ClaimedIngestionJob,
} from './ingestion-job.types';

describe('BookVectorizationService', () => {
  let repository: {
    getVectorizationContext: jest.Mock;
    listVectorChunks: jest.Mock;
    assertEmbeddingLease: jest.Mock;
    updateEmbeddingProgress: jest.Mock;
    completeEmbedding: jest.Mock;
  };
  let embeddings: { embedBatch: jest.Mock };
  let vectorStore: {
    replaceVersionStart: jest.Mock;
    insert: jest.Mock;
    flush: jest.Mock;
    countVersion: jest.Mock;
    deleteVersion: jest.Mock;
  };
  let service: BookVectorizationService;

  beforeEach(() => {
    repository = {
      getVectorizationContext: jest.fn().mockResolvedValue(context()),
      listVectorChunks: jest.fn((_: unknown, offset: number) =>
        Promise.resolve(chunks().slice(offset, offset + 2)),
      ),
      assertEmbeddingLease: jest.fn().mockResolvedValue(undefined),
      updateEmbeddingProgress: jest.fn().mockResolvedValue(undefined),
      completeEmbedding: jest.fn().mockResolvedValue(undefined),
    };
    embeddings = {
      embedBatch: jest.fn((texts: string[]) =>
        Promise.resolve(texts.map((_, index) => [index, 0, 1])),
      ),
    };
    vectorStore = {
      replaceVersionStart: jest.fn().mockResolvedValue(undefined),
      insert: jest.fn().mockResolvedValue(undefined),
      flush: jest.fn().mockResolvedValue(undefined),
      countVersion: jest.fn().mockResolvedValue(3),
      deleteVersion: jest.fn().mockResolvedValue(undefined),
    };
    service = new BookVectorizationService(
      repository as unknown as IngestionJobRepository,
      embeddings as unknown as BookEmbeddingService,
      vectorStore as unknown as BookVectorStoreService,
      {
        get: jest.fn((key: string) =>
          key === 'books.embeddingBatchSize' ? 2 : undefined,
        ),
      } as unknown as ConfigService,
    );
  });

  it('rebuilds one scoped version in batches and marks the book ready', async () => {
    await service.vectorize(job());

    expect(vectorStore.replaceVersionStart).toHaveBeenCalledWith(context());
    expect(embeddings.embedBatch).toHaveBeenCalledTimes(2);
    expect(vectorStore.insert).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining([
        expect.objectContaining({
          id: 'chunk-1',
          ownerScope: 'user-a',
          bookId: 'book-a',
          embeddingVersion: 'book-embedding-v1',
        }),
      ]),
    );
    expect(repository.updateEmbeddingProgress).toHaveBeenLastCalledWith(
      job(),
      3,
      3,
    );
    expect(repository.completeEmbedding).toHaveBeenCalledWith(job());
    expect(vectorStore.deleteVersion).not.toHaveBeenCalled();
  });

  it('cleans partial vectors and preserves a safe embedding failure', async () => {
    embeddings.embedBatch.mockRejectedValue(
      new IngestionError(
        'EMBEDDING_UNAVAILABLE',
        '暂时无法生成小说索引，请稍后重试',
      ),
    );

    await expect(service.vectorize(job())).rejects.toMatchObject({
      code: 'EMBEDDING_UNAVAILABLE',
    });
    expect(vectorStore.deleteVersion).toHaveBeenCalledWith(context());
    expect(repository.completeEmbedding).not.toHaveBeenCalled();
  });

  it('does not mark ready when the Milvus count differs from PostgreSQL', async () => {
    vectorStore.countVersion.mockResolvedValue(2);

    await expect(service.vectorize(job())).rejects.toMatchObject({
      code: 'VECTOR_STORE_UNAVAILABLE',
    });
    expect(vectorStore.deleteVersion).toHaveBeenCalledWith(context());
    expect(repository.completeEmbedding).not.toHaveBeenCalled();
  });

  function job(): ClaimedIngestionJob {
    return {
      jobId: 'job-a',
      bookId: 'book-a',
      storageKey: 'private/user-a/book-a/source.txt',
      originalFileName: 'book.txt',
      embeddingVersion: 'book-embedding-v1',
    };
  }

  function context(): BookVectorizationContext {
    return {
      ownerScope: 'user-a',
      bookId: 'book-a',
      embeddingVersion: 'book-embedding-v1',
      totalChunks: 3,
    };
  }

  function chunks() {
    return [1, 2, 3].map((index) => ({
      id: `chunk-${index}`,
      sectionId: 'section-a',
      sectionOrder: 1,
      chunkIndex: index - 1,
      content: `片段${index}`,
    }));
  }
});
