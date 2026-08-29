import { PrismaService } from '../prisma/prisma.service';
import { BookEmbeddingService } from '../vector/book-embedding.service';
import { BookVectorStoreService } from '../vector/book-vector-store.service';
import { BookChunkRetrieverService } from './book-chunk-retriever.service';

describe('BookChunkRetrieverService', () => {
  let prisma: { bookChunk: { findMany: jest.Mock } };
  let embeddings: { embedBatch: jest.Mock };
  let vectorStore: { searchChunkIds: jest.Mock };
  let service: BookChunkRetrieverService;

  beforeEach(() => {
    prisma = {
      bookChunk: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            chunk('chunk-a', 1, 0, 0, 100),
            chunk('chunk-overlap', 1, 1, 80, 180),
            chunk('chunk-b', 2, 0, 0, 100),
          ]),
      },
    };
    embeddings = { embedBatch: jest.fn().mockResolvedValue([[1, 0, 0]]) };
    vectorStore = {
      searchChunkIds: jest.fn().mockResolvedValue([
        { id: 'chunk-a', score: 0.95 },
        { id: 'chunk-overlap', score: 0.9 },
        { id: 'chunk-b', score: 0.8 },
        { id: 'foreign-chunk', score: 0.99 },
      ]),
    };
    service = new BookChunkRetrieverService(
      prisma as unknown as PrismaService,
      embeddings as unknown as BookEmbeddingService,
      vectorStore as unknown as BookVectorStoreService,
    );
  });

  it('hydrates only expected book chunks from PostgreSQL and deduplicates overlap', async () => {
    const boundary = {
      ownerScope: 'user-a',
      bookId: 'book-a',
      embeddingVersion: 'book-embedding-v1',
      spoilerCeiling: 2,
    };

    const result = await service.retrieve(boundary, '谁在夜里出现？');

    expect(vectorStore.searchChunkIds).toHaveBeenCalledWith(
      boundary,
      [1, 0, 0],
      2,
      12,
    );
    expect(prisma.bookChunk.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: {
            in: ['chunk-a', 'chunk-overlap', 'chunk-b', 'foreign-chunk'],
          },
          bookId: 'book-a',
          embeddingVersion: 'book-embedding-v1',
          sectionOrder: { lte: 2 },
        },
      }),
    );
    expect(result.map((item) => item.chunkId)).toEqual(['chunk-a', 'chunk-b']);
    expect(result.every((item) => item.bookId === 'book-a')).toBe(true);
  });

  function chunk(
    id: string,
    sectionOrder: number,
    chunkIndex: number,
    startOffset: number,
    endOffset: number,
  ) {
    return {
      id,
      bookId: 'book-a',
      sectionId: `section-${sectionOrder}`,
      sectionOrder,
      chunkIndex,
      content: `第 ${sectionOrder} 章正文`,
      startOffset,
      endOffset,
      section: { title: `第 ${sectionOrder} 章` },
    };
  }
});
