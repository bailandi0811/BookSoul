import { Injectable, Logger } from '@nestjs/common';
import { BookFileStorageService } from '../books/book-file-storage.service';
import { BookVectorStoreService } from '../vector/book-vector-store.service';
import { IngestionJobRepository } from './ingestion-job.repository';
import {
  type ClaimedDeletionJob,
  IngestionLeaseLostError,
} from './ingestion-job.types';

@Injectable()
export class BookDeletionProcessorService {
  private readonly logger = new Logger(BookDeletionProcessorService.name);

  constructor(
    private readonly repository: IngestionJobRepository,
    private readonly vectorStore: BookVectorStoreService,
    private readonly storage: BookFileStorageService,
  ) {}

  async process(job: ClaimedDeletionJob): Promise<void> {
    try {
      await this.vectorStore.deleteBook(job.ownerScope, job.bookId);
      await this.storage.deleteByKey(job.storageKey);
      await this.repository.completeDeletion(job);
    } catch (error) {
      if (error instanceof IngestionLeaseLostError) {
        this.logger.warn(`Deletion lease lost for book ${job.bookId}`);
        return;
      }
      this.logger.error(`Deletion cleanup failed for book ${job.bookId}`);
      await this.repository.failDeletion(job);
    }
  }
}
