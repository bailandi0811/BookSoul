import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookEmbeddingService } from '../vector/book-embedding.service';
import { BookVectorStoreService } from '../vector/book-vector-store.service';
import type { BookVectorRecord } from '../vector/book-vector.types';
import { IngestionError } from './errors/ingestion-error';
import { IngestionJobRepository } from './ingestion-job.repository';
import type {
  BookVectorizationContext,
  ClaimedIngestionJob,
} from './ingestion-job.types';

@Injectable()
export class BookVectorizationService {
  private readonly logger = new Logger(BookVectorizationService.name);
  private readonly batchSize: number;

  constructor(
    private readonly repository: IngestionJobRepository,
    private readonly embeddings: BookEmbeddingService,
    private readonly vectorStore: BookVectorStoreService,
    configService: ConfigService,
  ) {
    this.batchSize =
      configService.get<number>('books.embeddingBatchSize') || 32;
  }

  async vectorize(job: ClaimedIngestionJob): Promise<void> {
    let context: BookVectorizationContext | null = null;
    try {
      context = await this.repository.getVectorizationContext(job);
      await this.vectorStore.replaceVersionStart(context);

      let completed = 0;
      while (completed < context.totalChunks) {
        const chunks = await this.repository.listVectorChunks(
          context,
          completed,
          this.batchSize,
        );
        if (chunks.length === 0) {
          throw new Error('Book chunks ended before the expected count');
        }
        const vectors = await this.embeddings.embedBatch(
          chunks.map((chunk) => chunk.content),
        );
        await this.repository.assertEmbeddingLease(job);
        const records: BookVectorRecord[] = chunks.map((chunk, index) => ({
          id: chunk.id,
          ownerScope: context!.ownerScope,
          bookId: context!.bookId,
          sectionId: chunk.sectionId,
          sectionOrder: chunk.sectionOrder,
          chunkIndex: chunk.chunkIndex,
          embeddingVersion: context!.embeddingVersion,
          vector: vectors[index],
        }));
        await this.vectorStore.insert(records);
        completed += chunks.length;
        await this.repository.updateEmbeddingProgress(
          job,
          completed,
          context.totalChunks,
        );
      }

      await this.vectorStore.flush();
      const vectorCount = await this.vectorStore.countVersion(context);
      if (vectorCount !== context.totalChunks) {
        throw new IngestionError(
          'VECTOR_STORE_UNAVAILABLE',
          '小说索引校验失败，请稍后重试',
        );
      }
      await this.repository.completeEmbedding(job);
    } catch (error) {
      if (context) {
        await this.vectorStore.deleteVersion(context).catch(() => {
          this.logger.warn(
            `Partial vector cleanup deferred for book ${job.bookId}`,
          );
        });
      }
      throw error;
    }
  }
}
