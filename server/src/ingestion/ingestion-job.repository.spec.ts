import { BookStatus, IngestionJobStatus, ReadingMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IngestionJobRepository } from './ingestion-job.repository';
import type {
  ClaimedIngestionJob,
  PreparedChunk,
  PreparedSection,
} from './ingestion-job.types';
import { IngestionLeaseLostError } from './ingestion-job.types';

describe('IngestionJobRepository', () => {
  let tx: {
    ingestionJob: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
    };
    book: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    bookSection: {
      deleteMany: jest.Mock;
      createMany: jest.Mock;
    };
    bookChunk: {
      createMany: jest.Mock;
    };
    bookAssistant: {
      upsert: jest.Mock;
    };
    readingProgress: {
      upsert: jest.Mock;
    };
  };
  let prisma: {
    $transaction: jest.Mock;
    ingestionJob: {
      findFirst: jest.Mock;
      count: jest.Mock;
      updateMany: jest.Mock;
    };
    bookChunk: {
      count: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let repository: IngestionJobRepository;

  beforeEach(() => {
    tx = {
      ingestionJob: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      book: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      bookSection: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      bookChunk: {
        createMany: jest.fn(),
      },
      bookAssistant: {
        upsert: jest.fn(),
      },
      readingProgress: {
        upsert: jest.fn(),
      },
    };
    prisma = {
      $transaction: jest.fn(
        async (operation: (client: typeof tx) => Promise<unknown>) =>
          operation(tx),
      ),
      ingestionJob: {
        findFirst: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
      },
      bookChunk: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
    };
    repository = new IngestionJobRepository(prisma as unknown as PrismaService);
  });

  it('conditionally claims the oldest queued job and scopes its book', async () => {
    const now = new Date('2026-08-29T00:00:00.000Z');
    tx.ingestionJob.findFirst.mockResolvedValue({
      id: 'job-a',
      bookId: 'book-a',
    });
    tx.ingestionJob.updateMany.mockResolvedValue({ count: 1 });
    tx.book.updateMany.mockResolvedValue({ count: 1 });
    tx.ingestionJob.findUnique.mockResolvedValue({
      id: 'job-a',
      bookId: 'book-a',
      book: {
        storageKey: 'private/user-a/book-a/source.txt',
        originalFileName: 'book.txt',
        embeddingVersion: 'book-embedding-v1',
      },
    });

    const claimed = await repository.claimNext(now);

    expect(tx.ingestionJob.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: IngestionJobStatus.QUEUED,
          book: { status: { not: BookStatus.DELETING } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    );
    expect(tx.ingestionJob.updateMany).toHaveBeenCalledWith({
      where: { id: 'job-a', status: IngestionJobStatus.QUEUED },
      data: expect.objectContaining({
        status: IngestionJobStatus.RUNNING,
        attempt: { increment: 1 },
        heartbeatAt: now,
      }),
    });
    expect(claimed).toEqual(
      expect.objectContaining({
        jobId: 'job-a',
        bookId: 'book-a',
        originalFileName: 'book.txt',
      }),
    );
  });

  it('does not claim a job lost to a concurrent worker', async () => {
    tx.ingestionJob.findFirst.mockResolvedValue({
      id: 'job-a',
      bookId: 'book-a',
    });
    tx.ingestionJob.updateMany.mockResolvedValue({ count: 0 });

    await expect(repository.claimNext()).resolves.toBeNull();
    expect(tx.book.updateMany).not.toHaveBeenCalled();
  });

  it('claims retryable deletion work with its server-derived owner scope', async () => {
    const now = new Date('2026-08-29T00:01:00.000Z');
    const retryBefore = new Date('2026-08-29T00:00:30.000Z');
    const updatedAt = new Date('2026-08-29T00:00:00.000Z');
    tx.ingestionJob.findFirst.mockResolvedValue({
      id: 'job-a',
      bookId: 'book-a',
      status: IngestionJobStatus.FAILED,
      updatedAt,
    });
    tx.ingestionJob.updateMany.mockResolvedValue({ count: 1 });
    tx.ingestionJob.findUnique.mockResolvedValue({
      id: 'job-a',
      bookId: 'book-a',
      book: {
        ownerId: 'user-a',
        visibility: 'PRIVATE',
        storageKey: 'private/user-a/book-a/source.txt',
        status: BookStatus.DELETING,
      },
    });

    await expect(
      repository.claimNextDeletion(retryBefore, now),
    ).resolves.toEqual({
      jobId: 'job-a',
      bookId: 'book-a',
      ownerScope: 'user-a',
      storageKey: 'private/user-a/book-a/source.txt',
    });
    expect(tx.ingestionJob.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          book: { status: BookStatus.DELETING },
        }),
      }),
    );
  });

  it('recovers only stale jobs whose lease is still unchanged', async () => {
    const staleBefore = new Date('2026-08-29T00:00:00.000Z');
    tx.ingestionJob.findMany.mockResolvedValue([
      { id: 'job-a', bookId: 'book-a' },
      { id: 'job-b', bookId: 'book-b' },
    ]);
    tx.ingestionJob.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    tx.book.updateMany.mockResolvedValue({ count: 1 });

    await expect(repository.recoverStale(staleBefore)).resolves.toBe(1);
    expect(tx.book.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.book.updateMany).toHaveBeenCalledWith({
      where: { id: 'book-a', status: { not: BookStatus.DELETING } },
      data: { status: BookStatus.QUEUED, statusProgress: 0 },
    });
  });

  it('does not overwrite a book that entered deletion while processing', async () => {
    tx.ingestionJob.updateMany.mockResolvedValue({ count: 1 });
    tx.book.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.markChunking('job-a', 'book-a'),
    ).rejects.toBeInstanceOf(IngestionLeaseLostError);
    expect(tx.book.updateMany).toHaveBeenCalledWith({
      where: { id: 'book-a', status: { not: BookStatus.DELETING } },
      data: { status: BookStatus.CHUNKING, statusProgress: 25 },
    });
  });

  it('replaces parsed content in bounded batches before advancing to embedding', async () => {
    tx.ingestionJob.count.mockResolvedValue(1);
    tx.bookSection.deleteMany.mockResolvedValue({ count: 0 });
    tx.bookSection.createMany.mockResolvedValue({ count: 1 });
    tx.bookChunk.createMany.mockResolvedValue({ count: 250 });
    tx.book.updateMany.mockResolvedValue({ count: 1 });
    tx.ingestionJob.updateMany.mockResolvedValue({ count: 1 });
    const job = claimedJob();
    const sections: PreparedSection[] = [
      {
        id: 'section-a',
        order: 1,
        title: '第一章',
        content: '正文',
        charCount: 2,
      },
    ];
    const chunks: PreparedChunk[] = Array.from({ length: 251 }, (_, index) => ({
      id: `chunk-${index}`,
      sectionId: 'section-a',
      sectionOrder: 1,
      chunkIndex: index,
      content: `片段${index}`,
      startOffset: index,
      endOffset: index + 1,
    }));

    await repository.completeParsing({
      job,
      parsed: { title: '测试书', author: '作者', sections: [] },
      sections,
      chunks,
    });

    expect(tx.bookChunk.createMany).toHaveBeenCalledTimes(2);
    expect(tx.book.updateMany).toHaveBeenCalledWith({
      where: { id: 'book-a', status: { not: BookStatus.DELETING } },
      data: expect.objectContaining({
        title: '测试书',
        sectionCount: 1,
        chunkCount: 251,
        status: BookStatus.EMBEDDING,
        statusProgress: 30,
      }),
    });
    expect(tx.ingestionJob.updateMany).toHaveBeenCalledWith({
      where: { id: 'job-a', status: IngestionJobStatus.RUNNING },
      data: expect.objectContaining({
        heartbeatAt: expect.any(Date),
        lastError: null,
      }),
    });
  });

  it('derives vector scope from the active job and verifies PostgreSQL count', async () => {
    prisma.ingestionJob.findFirst.mockResolvedValue({
      book: {
        ownerId: 'user-a',
        visibility: 'PRIVATE',
        embeddingVersion: 'book-embedding-v1',
        chunkCount: 2,
      },
    });
    prisma.bookChunk.count.mockResolvedValue(2);

    await expect(
      repository.getVectorizationContext(claimedJob()),
    ).resolves.toEqual({
      ownerScope: 'user-a',
      bookId: 'book-a',
      embeddingVersion: 'book-embedding-v1',
      totalChunks: 2,
    });
  });

  it('marks the book ready only while the embedding lease remains active', async () => {
    tx.book.findFirst.mockResolvedValue({
      ownerId: 'user-a',
      visibility: 'PRIVATE',
      title: '测试书',
    });
    tx.book.updateMany.mockResolvedValue({ count: 1 });
    tx.ingestionJob.updateMany.mockResolvedValue({ count: 1 });
    tx.bookAssistant.upsert.mockResolvedValue({});
    tx.readingProgress.upsert.mockResolvedValue({});

    await repository.completeEmbedding(claimedJob());

    expect(tx.book.updateMany).toHaveBeenCalledWith({
      where: { id: 'book-a', status: BookStatus.EMBEDDING },
      data: expect.objectContaining({
        status: BookStatus.READY,
        statusProgress: 100,
        readyAt: expect.any(Date),
      }),
    });
    expect(tx.ingestionJob.updateMany).toHaveBeenCalledWith({
      where: { id: 'job-a', status: IngestionJobStatus.RUNNING },
      data: expect.objectContaining({
        status: IngestionJobStatus.SUCCEEDED,
        lockedAt: null,
      }),
    });
    expect(tx.bookAssistant.upsert).toHaveBeenCalledWith({
      where: {
        ownerId_bookId: { ownerId: 'user-a', bookId: 'book-a' },
      },
      create: {
        ownerId: 'user-a',
        bookId: 'book-a',
        name: '《测试书》阅读助手',
      },
      update: {},
    });
    expect(tx.readingProgress.upsert).toHaveBeenCalledWith({
      where: {
        ownerId_bookId: { ownerId: 'user-a', bookId: 'book-a' },
      },
      create: {
        ownerId: 'user-a',
        bookId: 'book-a',
        mode: ReadingMode.NOT_STARTED,
      },
      update: {},
    });
  });

  it('persists only safe failure information for an active lease', async () => {
    tx.ingestionJob.updateMany.mockResolvedValue({ count: 1 });
    tx.book.updateMany.mockResolvedValue({ count: 1 });

    await repository.fail(claimedJob(), 'INVALID_EPUB', 'EPUB 文件结构无效');

    expect(tx.ingestionJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastError: 'INVALID_EPUB' }),
      }),
    );
    expect(tx.book.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failureCode: 'INVALID_EPUB',
          failureMessage: 'EPUB 文件结构无效',
        }),
      }),
    );
  });

  function claimedJob(): ClaimedIngestionJob {
    return {
      jobId: 'job-a',
      bookId: 'book-a',
      storageKey: 'private/user-a/book-a/source.txt',
      originalFileName: 'book.txt',
      embeddingVersion: 'book-embedding-v1',
    };
  }
});
