import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { BookFileStorageService } from '../books/book-file-storage.service';
import { BookParserService } from './book-parser.service';
import { BookVectorizationService } from './book-vectorization.service';
import {
  IngestionError,
  type IngestionErrorCode,
} from './errors/ingestion-error';
import { IngestionJobRepository } from './ingestion-job.repository';
import {
  type ClaimedIngestionJob,
  IngestionLeaseLostError,
  type PreparedChunk,
  type PreparedSection,
} from './ingestion-job.types';
import { TextChunkerService } from './text-chunker.service';

@Injectable()
export class IngestionProcessorService {
  private readonly logger = new Logger(IngestionProcessorService.name);

  constructor(
    private readonly repository: IngestionJobRepository,
    private readonly storage: BookFileStorageService,
    private readonly parser: BookParserService,
    private readonly chunker: TextChunkerService,
    private readonly vectorization: BookVectorizationService,
  ) {}

  async process(job: ClaimedIngestionJob, signal?: AbortSignal): Promise<void> {
    try {
      signal?.throwIfAborted();
      const parsed = await this.storage.withLocalPath(
        job.storageKey,
        (filePath) =>
          this.parser.parse({
            filePath,
            originalFileName: job.originalFileName,
          }),
        signal,
      );
      signal?.throwIfAborted();
      await this.repository.markChunking(job);

      const sections: PreparedSection[] = [];
      const chunks: PreparedChunk[] = [];
      for (const parsedSection of parsed.sections) {
        signal?.throwIfAborted();
        const sectionId = randomUUID();
        sections.push({
          id: sectionId,
          order: parsedSection.order,
          title: parsedSection.title,
          ...(parsedSection.sourceRef
            ? { sourceRef: parsedSection.sourceRef }
            : {}),
          content: parsedSection.content,
          charCount: parsedSection.content.length,
        });
        for (const chunk of this.chunker.chunk(parsedSection.content)) {
          chunks.push({
            id: randomUUID(),
            sectionId,
            sectionOrder: parsedSection.order,
            ...chunk,
          });
        }
      }

      await this.repository.completeParsing({
        job,
        parsed,
        sections,
        chunks,
      });
      signal?.throwIfAborted();
      await this.vectorization.vectorize(job, signal);
    } catch (error) {
      if (error instanceof IngestionLeaseLostError || signal?.aborted) {
        this.logger.warn(`Ingestion lease lost for book ${job.bookId}`);
        return;
      }
      const failure = this.toFailure(error);
      this.logger.error(
        `Ingestion failed for book ${job.bookId} with ${failure.code}`,
      );
      await this.repository.fail(job, failure.code, failure.safeMessage);
    }
  }

  private toFailure(error: unknown): {
    code: IngestionErrorCode;
    safeMessage: string;
  } {
    if (error instanceof IngestionError) {
      return { code: error.code, safeMessage: error.message };
    }
    return {
      code: 'INTERNAL_PROCESSING_ERROR',
      safeMessage: '小说处理失败，请稍后重试',
    };
  }
}
