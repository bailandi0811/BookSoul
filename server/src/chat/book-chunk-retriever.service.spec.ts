import { PrismaService } from '../prisma/prisma.service';
import { BookEmbeddingService } from '../vector/book-embedding.service';
import { BookVectorStoreService } from '../vector/book-vector-store.service';
import { BookChunkRetrieverService } from './book-chunk-retriever.service';

describe('BookChunkRetrieverService', () => {
  let prisma: {
    bookChunk: { findMany: jest.Mock };
    book: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let embeddings: { embedBatch: jest.Mock };
  let vectorStore: { searchChunkIds: jest.Mock };
  let service: BookChunkRetrieverService;

  beforeEach(() => {
    prisma = {
      book: { findFirst: jest.fn().mockResolvedValue({ id: 'book-a' }) },
      $transaction: jest.fn(
        async (operation: (tx: typeof prisma) => Promise<unknown>) =>
          operation(prisma),
      ),
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

    const result = await service.retrieve(boundary, {
      queries: ['谁在夜里出现？'],
      limit: 6,
      maxContextChars: 5_400,
      maxPerSection: 3,
    });

    expect(vectorStore.searchChunkIds).toHaveBeenCalledWith(
      boundary,
      [1, 0, 0],
      2,
      12,
    );
    expect(prisma.bookChunk.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          bookId: 'book-a',
          embeddingVersion: 'book-embedding-v1',
          sectionOrder: { lte: 2 },
          book: {
            ownerId: 'user-a',
            visibility: 'PRIVATE',
            status: 'READY',
            embeddingVersion: 'book-embedding-v1',
          },
        },
      }),
    );
    expect(result.map((item) => item.chunkId)).toEqual(['chunk-a', 'chunk-b']);
    expect(result.every((item) => item.bookId === 'book-a')).toBe(true);
  });

  it('merges multiple retrieval queries while preserving scoped hydration', async () => {
    embeddings.embedBatch.mockResolvedValue([
      [1, 0, 0],
      [0, 1, 0],
    ]);
    vectorStore.searchChunkIds
      .mockResolvedValueOnce([
        { id: 'chunk-a', score: 0.95 },
        { id: 'chunk-b', score: 0.7 },
      ])
      .mockResolvedValueOnce([{ id: 'chunk-b', score: 0.96 }]);

    const result = await service.retrieve(
      {
        ownerScope: 'user-a',
        bookId: 'book-a',
        embeddingVersion: 'book-embedding-v1',
        spoilerCeiling: 2,
      },
      {
        queries: ['他为什么这么做？', '旧友交出信件的原因'],
        limit: 8,
        maxContextChars: 7_200,
        maxPerSection: 2,
      },
    );

    expect(embeddings.embedBatch).toHaveBeenCalledWith(
      ['他为什么这么做？', '旧友交出信件的原因'],
      expect.any(AbortSignal),
    );
    expect(vectorStore.searchChunkIds).toHaveBeenCalledTimes(2);
    expect(result.map((item) => item.chunkId)).toEqual(['chunk-b', 'chunk-a']);
  });

  it('caps the source text sent to the model without expanding the citation excerpt', async () => {
    const longContent = '甲'.repeat(1_500);
    prisma.bookChunk.findMany.mockResolvedValue([
      {
        ...chunk('chunk-a', 1, 0, 0, 1_500),
        content: longContent,
      },
    ]);
    vectorStore.searchChunkIds.mockResolvedValue([
      { id: 'chunk-a', score: 0.95 },
    ]);

    const [result] = await service.retrieve(
      {
        ownerScope: 'user-a',
        bookId: 'book-a',
        embeddingVersion: 'book-embedding-v1',
        spoilerCeiling: 2,
      },
      {
        queries: ['发生了什么？'],
        limit: 4,
        maxContextChars: 1_000,
        maxPerSection: 4,
      },
    );

    expect(result.content).toHaveLength(1_000);
    expect(result.excerpt).toHaveLength(600);
  });

  it('limits repeated chunks from one section for broad context diversity', async () => {
    prisma.bookChunk.findMany.mockResolvedValue([
      chunk('chunk-a', 1, 0, 0, 100),
      chunk('chunk-c', 1, 2, 200, 300),
      chunk('chunk-b', 2, 0, 0, 100),
      chunk('chunk-d', 3, 0, 0, 100),
    ]);
    vectorStore.searchChunkIds.mockResolvedValue([
      { id: 'chunk-a', score: 0.95 },
      { id: 'chunk-c', score: 0.9 },
      { id: 'chunk-b', score: 0.85 },
      { id: 'chunk-d', score: 0.8 },
    ]);

    const result = await service.retrieve(
      {
        ownerScope: 'user-a',
        bookId: 'book-a',
        embeddingVersion: 'book-embedding-v1',
        spoilerCeiling: 3,
      },
      {
        queries: ['比较两个章节'],
        limit: 3,
        maxContextChars: 7_200,
        maxPerSection: 1,
      },
    );

    expect(result.map((item) => item.chunkId)).toEqual([
      'chunk-a',
      'chunk-b',
      'chunk-d',
    ]);
  });

  it('returns lexical evidence even when vector search has no hits', async () => {
    prisma.bookChunk.findMany.mockResolvedValue([
      { ...chunk('rare', 1, 0, 0, 100), content: '澹台烬在河边交出信物。' },
    ]);
    vectorStore.searchChunkIds.mockResolvedValue([]);
    const result = await service.retrieve(
      {
        ownerScope: 'user-a',
        bookId: 'book-a',
        embeddingVersion: 'book-embedding-v1',
        spoilerCeiling: 1,
      },
      {
        queries: ['澹台烬'],
        limit: 4,
        maxContextChars: 3600,
        maxPerSection: 4,
      },
    );
    expect(result.map((hit) => hit.chunkId)).toEqual(['rare']);
  });

  it('rejects an inaccessible or deleting book before reading its corpus', async () => {
    prisma.book.findFirst.mockResolvedValue(null);
    await expect(
      service.retrieve(
        {
          ownerScope: 'user-a',
          bookId: 'book-a',
          embeddingVersion: 'book-embedding-v1',
          spoilerCeiling: 1,
        },
        { queries: ['谁'], limit: 4, maxContextChars: 3600, maxPerSection: 4 },
      ),
    ).rejects.toThrow();
    expect(prisma.bookChunk.findMany).not.toHaveBeenCalled();
  });

  it('does not downgrade when the lexical corpus cannot be loaded', async () => {
    prisma.bookChunk.findMany.mockRejectedValue(
      new Error('database unavailable'),
    );
    await expect(
      service.retrieve(
        {
          ownerScope: 'user-a',
          bookId: 'book-a',
          embeddingVersion: 'book-embedding-v1',
          spoilerCeiling: 1,
        },
        { queries: ['谁'], limit: 4, maxContextChars: 3600, maxPerSection: 4 },
      ),
    ).rejects.toThrow();
  });

  it('rejects late results after the book is deleted or its version changes', async () => {
    prisma.book.findFirst
      .mockResolvedValueOnce({ id: 'book-a' })
      .mockResolvedValueOnce(null);
    await expect(
      service.retrieve(
        {
          ownerScope: 'user-a',
          bookId: 'book-a',
          embeddingVersion: 'book-embedding-v1',
          spoilerCeiling: 1,
        },
        { queries: ['谁'], limit: 4, maxContextChars: 3600, maxPerSection: 4 },
      ),
    ).rejects.toThrow('书籍状态已变化');
  });

  it('reads every visible page before computing lexical statistics', async () => {
    prisma.bookChunk.findMany
      .mockResolvedValueOnce(
        Array.from({ length: 250 }, (_, index) => ({
          ...chunk(`c-${index}`, 1, index, index * 100, index * 100 + 100),
          content: '河边旧友',
        })),
      )
      .mockResolvedValueOnce([
        { ...chunk('rare', 1, 250, 25000, 25100), content: '澹台烬持有信物' },
      ]);
    vectorStore.searchChunkIds.mockResolvedValue([]);
    const result = await service.retrieve(
      {
        ownerScope: 'user-a',
        bookId: 'book-a',
        embeddingVersion: 'book-embedding-v1',
        spoilerCeiling: 1,
      },
      {
        queries: ['澹台烬'],
        limit: 4,
        maxContextChars: 3600,
        maxPerSection: 4,
      },
    );
    expect(result.map((hit) => hit.chunkId)).toEqual(['rare']);
    expect(prisma.bookChunk.findMany.mock.calls[1][0].skip).toBe(250);
  });

  it('keeps SYSTEM scope separate from private owners', async () => {
    await service.retrieve(
      {
        ownerScope: '__system__',
        bookId: 'book-a',
        embeddingVersion: 'book-embedding-v1',
        spoilerCeiling: 2,
      },
      { queries: ['谁'], limit: 4, maxContextChars: 3600, maxPerSection: 4 },
    );
    expect(prisma.bookChunk.findMany.mock.calls[0][0].where.book).toEqual({
      visibility: 'SYSTEM',
      status: 'READY',
      embeddingVersion: 'book-embedding-v1',
    });
  });

  it('does not return dense results when the visible corpus exceeds its budget', async () => {
    prisma.bookChunk.findMany.mockResolvedValue([
      {
        ...chunk('large', 1, 0, 0, 100),
        content: 'a'.repeat(16 * 1024 * 1024 + 1),
      },
    ]);
    await expect(
      service.retrieve(
        {
          ownerScope: 'user-a',
          bookId: 'book-a',
          embeddingVersion: 'book-embedding-v1',
          spoilerCeiling: 1,
        },
        { queries: ['谁'], limit: 4, maxContextChars: 3600, maxPerSection: 4 },
      ),
    ).rejects.toThrow('超出词法检索预算');
  });

  it('does not start vector search when cancelled during embedding', async () => {
    const controller = new AbortController();
    embeddings.embedBatch.mockImplementation(async () => {
      controller.abort();
      return [[1, 0, 0]];
    });
    await expect(
      service.retrieve(
        {
          ownerScope: 'user-a',
          bookId: 'book-a',
          embeddingVersion: 'book-embedding-v1',
          spoilerCeiling: 1,
        },
        { queries: ['谁'], limit: 4, maxContextChars: 3600, maxPerSection: 4 },
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(vectorStore.searchChunkIds).not.toHaveBeenCalled();
  });

  it('stops the dense sibling after lexical scoring fails', async () => {
    let resolveEmbedding!: (vectors: number[][]) => void;
    embeddings.embedBatch.mockImplementation(
      () =>
        new Promise<number[][]>((resolve) => {
          resolveEmbedding = resolve;
        }),
    );
    const clock = jest
      .spyOn(performance, 'now')
      .mockReturnValue(6000)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0);
    try {
      await expect(
        service.retrieve(
          {
            ownerScope: 'user-a',
            bookId: 'book-a',
            embeddingVersion: 'book-embedding-v1',
            spoilerCeiling: 1,
          },
          {
            queries: ['谁'],
            limit: 4,
            maxContextChars: 3600,
            maxPerSection: 4,
          },
        ),
      ).rejects.toThrow('超出词法检索预算');
      resolveEmbedding([[1, 0, 0]]);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(vectorStore.searchChunkIds).not.toHaveBeenCalled();
    } finally {
      clock.mockRestore();
    }
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
