import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookDeletionProcessorService } from './book-deletion-processor.service';
import { IngestionJobRepository } from './ingestion-job.repository';
import { IngestionProcessorService } from './ingestion-processor.service';

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
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.activeTick) await this.activeTick;
  }

  async runOnce(): Promise<boolean> {
    if (this.running) return false;
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
        await this.deletionProcessor.process(deletion);
        return true;
      }
      const job = await this.repository.claimNext();
      if (!job) return false;
      await this.processor.process(job);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Book ingestion worker tick failed: ${message}`);
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
}
