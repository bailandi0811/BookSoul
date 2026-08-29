import { ConfigService } from '@nestjs/config';
import { BookDeletionProcessorService } from './book-deletion-processor.service';
import { IngestionJobRepository } from './ingestion-job.repository';
import type { ClaimedIngestionJob } from './ingestion-job.types';
import { IngestionProcessorService } from './ingestion-processor.service';
import { IngestionWorkerService } from './ingestion-worker.service';

describe('IngestionWorkerService', () => {
  let repository: {
    recoverStale: jest.Mock;
    claimNextDeletion: jest.Mock;
    claimNext: jest.Mock;
  };
  let processor: { process: jest.Mock };
  let deletionProcessor: { process: jest.Mock };
  let worker: IngestionWorkerService;

  beforeEach(() => {
    repository = {
      recoverStale: jest.fn().mockResolvedValue(0),
      claimNextDeletion: jest.fn().mockResolvedValue(null),
      claimNext: jest.fn().mockResolvedValue(null),
    };
    processor = {
      process: jest.fn().mockResolvedValue(undefined),
    };
    deletionProcessor = {
      process: jest.fn().mockResolvedValue(undefined),
    };
    worker = new IngestionWorkerService(
      repository as unknown as IngestionJobRepository,
      processor as unknown as IngestionProcessorService,
      deletionProcessor as unknown as BookDeletionProcessorService,
      {
        get: jest.fn((key: string) => {
          const values: Record<string, unknown> = {
            'books.ingestionWorkerEnabled': false,
            'books.ingestionPollMs': 2_000,
            'books.ingestionStaleMs': 60_000,
            'books.deletionRetryMs': 30_000,
          };
          return values[key];
        }),
      } as unknown as ConfigService,
    );
  });

  it('recovers stale leases before claiming and processing one job', async () => {
    const job = claimedJob();
    repository.recoverStale.mockResolvedValue(1);
    repository.claimNext.mockResolvedValue(job);

    await expect(worker.runOnce()).resolves.toBe(true);

    expect(repository.recoverStale).toHaveBeenCalledWith(expect.any(Date));
    expect(repository.claimNext).toHaveBeenCalledTimes(1);
    expect(processor.process).toHaveBeenCalledWith(job);
  });

  it('returns false without work and prevents overlapping ticks', async () => {
    await expect(worker.runOnce()).resolves.toBe(false);

    const job = claimedJob();
    repository.claimNext.mockResolvedValue(job);
    let release: (() => void) | undefined;
    processor.process.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    const first = worker.runOnce();
    await Promise.resolve();
    await expect(worker.runOnce()).resolves.toBe(false);
    release?.();
    await expect(first).resolves.toBe(true);
  });

  it('prioritizes a durable deletion job over new ingestion work', async () => {
    const deletion = {
      jobId: 'job-delete',
      bookId: 'book-delete',
      ownerScope: 'user-a',
      storageKey: 'private/user-a/book-delete/source.txt',
    };
    repository.claimNextDeletion.mockResolvedValue(deletion);

    await expect(worker.runOnce()).resolves.toBe(true);

    expect(deletionProcessor.process).toHaveBeenCalledWith(deletion);
    expect(repository.claimNext).not.toHaveBeenCalled();
    expect(processor.process).not.toHaveBeenCalled();
  });

  it('waits for an active scheduled tick during shutdown', async () => {
    const job = claimedJob();
    repository.claimNext.mockResolvedValue(job);
    let release: (() => void) | undefined;
    processor.process.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const enabledWorker = new IngestionWorkerService(
      repository as unknown as IngestionJobRepository,
      processor as unknown as IngestionProcessorService,
      deletionProcessor as unknown as BookDeletionProcessorService,
      {
        get: jest.fn((key: string) => {
          const values: Record<string, unknown> = {
            'books.ingestionWorkerEnabled': true,
            'books.ingestionPollMs': 60_000,
            'books.ingestionStaleMs': 60_000,
            'books.deletionRetryMs': 30_000,
          };
          return values[key];
        }),
      } as unknown as ConfigService,
    );

    enabledWorker.onModuleInit();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(processor.process).toHaveBeenCalledWith(job);

    const shutdown = enabledWorker.onModuleDestroy();
    let shutdownFinished = false;
    void shutdown.then(() => {
      shutdownFinished = true;
    });
    await Promise.resolve();
    expect(shutdownFinished).toBe(false);

    release?.();
    await shutdown;
    expect(shutdownFinished).toBe(true);
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
