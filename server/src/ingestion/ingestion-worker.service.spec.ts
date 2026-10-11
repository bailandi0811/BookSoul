import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
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
    heartbeat: jest.Mock;
  };
  let processor: { process: jest.Mock };
  let deletionProcessor: { process: jest.Mock };
  let worker: IngestionWorkerService;

  beforeEach(() => {
    repository = {
      recoverStale: jest.fn().mockResolvedValue(0),
      claimNextDeletion: jest.fn().mockResolvedValue(null),
      claimNext: jest.fn().mockResolvedValue(null),
      heartbeat: jest.fn().mockResolvedValue(undefined),
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

  it('reports missing schema codes without leaking the original error', async () => {
    const log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    try {
      repository.recoverStale.mockRejectedValue({
        code: 'P2022',
        message: 'private database credentials',
        meta: { secret: 'private' },
      });
      await expect(worker.runOnce()).resolves.toBe(false);
      expect(log).toHaveBeenCalledWith(expect.stringContaining('[P2022]'));
      expect(JSON.stringify(log.mock.calls)).not.toContain('private');
      expect(repository.claimNext).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it('recovers stale leases before claiming and processing one job', async () => {
    const job = claimedJob();
    repository.recoverStale.mockResolvedValue(1);
    repository.claimNext.mockResolvedValue(job);

    await expect(worker.runOnce()).resolves.toBe(true);

    expect(repository.recoverStale).toHaveBeenCalledWith(expect.any(Date));
    expect(repository.claimNext).toHaveBeenCalledTimes(1);
    expect(processor.process).toHaveBeenCalledWith(
      job,
      expect.any(AbortSignal),
    );
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
      leaseToken: 'lease-delete',
      jobId: 'job-delete',
      bookId: 'book-delete',
      ownerScope: 'user-a',
      storageKey: 'private/user-a/book-delete/source.txt',
    };
    repository.claimNextDeletion.mockResolvedValue(deletion);

    await expect(worker.runOnce()).resolves.toBe(true);

    expect(deletionProcessor.process).toHaveBeenCalledWith(
      deletion,
      expect.any(AbortSignal),
    );
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
    expect(processor.process).toHaveBeenCalledWith(
      job,
      expect.any(AbortSignal),
    );

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

  it('cancels processing when its independent heartbeat loses the lease', async () => {
    jest.useFakeTimers();
    try {
      repository.claimNext.mockResolvedValue(claimedJob());
      repository.heartbeat.mockRejectedValue(new Error('lease lost'));
      let activeSignal: AbortSignal | undefined;
      processor.process.mockImplementation(
        (_job: unknown, signal: AbortSignal) =>
          new Promise<void>((resolve) => {
            activeSignal = signal;
            signal.addEventListener('abort', () => resolve(), { once: true });
          }),
      );
      const running = worker.runOnce();
      await jest.advanceTimersByTimeAsync(20_000);
      await running;
      expect(activeSignal?.aborted).toBe(true);
      expect(repository.heartbeat).toHaveBeenCalledWith(claimedJob());
    } finally {
      jest.useRealTimers();
    }
  });

  function claimedJob(): ClaimedIngestionJob {
    return {
      leaseToken: 'lease-a',
      jobId: 'job-a',
      bookId: 'book-a',
      storageKey: 'private/user-a/book-a/source.txt',
      originalFileName: 'book.txt',
      embeddingVersion: 'book-embedding-v1',
    };
  }
});
