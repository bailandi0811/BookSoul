import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { safeErrorCode } from '../common/safe-error-code';
import { BookDeletionProcessorService } from './book-deletion-processor.service';
import { IngestionJobRepository } from './ingestion-job.repository';
import { IngestionProcessorService } from './ingestion-processor.service';
import type {
  ClaimedIngestionJob,
  ClaimedDeletionJob,
} from './ingestion-job.types';

@Injectable()
export class IngestionWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IngestionWorkerService.name);
  private readonly enabled: boolean;
  private readonly pollMs: number;
  private readonly staleMs: number;
  private readonly deletionRetryMs: number;
  private timer: NodeJS.Timeout | null = null;
  private activeTick: Promise<boolean> | null = null;
  private running = false;
  private activeAbort: AbortController | null = null;
  private stopping = false;

  constructor(
    private readonly repository: IngestionJobRepository,
    private readonly processor: IngestionProcessorService,
    private readonly deletionProcessor: BookDeletionProcessorService,
    configService: ConfigService,
  ) {
    this.enabled =
      configService.get<boolean>('books.ingestionWorkerEnabled') ?? true;
    this.pollMs = configService.get<number>('books.ingestionPollMs') || 2_000;
    this.staleMs =
      configService.get<number>('books.ingestionStaleMs') || 15 * 60 * 1_000;
    this.deletionRetryMs =
      configService.get<number>('books.deletionRetryMs') || 30_000;
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('Book ingestion worker is disabled');
      return;
    }
    this.timer = setInterval(() => this.scheduleTick(), this.pollMs);
    this.timer.unref();
    this.scheduleTick();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.activeAbort?.abort();
    if (this.activeTick) await this.activeTick;
  }

  async runOnce(): Promise<boolean> {
    if (this.running || this.stopping) return false;
    this.running = true;
    try {
      const staleBefore = new Date(Date.now() - this.staleMs);
      const recovered = await this.repository.recoverStale(staleBefore);
      if (recovered > 0) {
        this.logger.warn(`Recovered ${recovered} stale ingestion job(s)`);
      }
      const deletion = await this.repository.claimNextDeletion(
        new Date(Date.now() - this.deletionRetryMs),
      );
      if (deletion) {
        await this.withHeartbeat(deletion, (signal) =>
          this.deletionProcessor.process(deletion, signal),
        );
        return true;
      }
      const job = await this.repository.claimNext();
      if (!job) return false;
      await this.withHeartbeat(job, (signal) =>
        this.processor.process(job, signal),
      );
      return true;
    } catch (error: unknown) {
      this.logger.error(
        `Book ingestion worker tick failed [${safeErrorCode(error)}]. For P2021/P2022, check pending database migrations.`,
      );
      return false;
    } finally {
      this.running = false;
    }
  }

  private scheduleTick(): void {
    if (this.activeTick) return;
    this.activeTick = this.runOnce().finally(() => {
      this.activeTick = null;
    });
  }

  private async withHeartbeat(
    job: ClaimedIngestionJob | ClaimedDeletionJob,
    operation: (signal: AbortSignal) => Promise<void>,
  ): Promise<void> {
    const controller = new AbortController();
    if (this.stopping) controller.abort();
    this.activeAbort = controller;
    const heartbeats = new Set<Promise<void>>();
    const timer = setInterval(
      () => {
        if (heartbeats.size) return;
        const pending = this.repository
          .heartbeat(job)
          .catch(() => {
            controller.abort();
          })
          .finally(() => {
            heartbeats.delete(pending);
          });
        heartbeats.add(pending);
      },
      Math.max(1000, Math.min(30_000, Math.floor(this.staleMs / 3))),
    );
    timer.unref();
    try {
      await operation(controller.signal);
    } finally {
      clearInterval(timer);
      await Promise.all(heartbeats);
      this.activeAbort = null;
    }
  }
}
