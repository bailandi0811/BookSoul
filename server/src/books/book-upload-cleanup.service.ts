import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { safeErrorCode } from '../common/safe-error-code';
import { BookUploadsService } from './book-uploads.service';

@Injectable()
export class BookUploadCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BookUploadCleanupService.name);
  private timer: NodeJS.Timeout | null = null;
  private pending: Promise<unknown> | null = null;
  constructor(
    private readonly uploads: BookUploadsService,
    private readonly config: ConfigService,
  ) {}
  onModuleInit(): void {
    if (this.config.get<boolean>('books.ingestionWorkerEnabled') === false)
      return;
    this.timer = setInterval(() => {
      if (this.pending) return;
      this.pending = this.uploads
        .cleanupExpired()
        .catch((error: unknown) =>
          this.logger.warn(
            `Book upload cleanup deferred [${safeErrorCode(error)}]. For P2021/P2022, check pending database migrations.`,
          ),
        )
        .finally(() => {
          this.pending = null;
        });
    }, 60_000);
    this.timer.unref();
  }
  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.pending;
  }
}
