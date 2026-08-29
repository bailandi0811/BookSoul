import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIEmbeddings } from '@langchain/openai';
import { IngestionError } from '../ingestion/errors/ingestion-error';

@Injectable()
export class BookEmbeddingService {
  private readonly logger = new Logger(BookEmbeddingService.name);
  private readonly client: OpenAIEmbeddings;
  private readonly vectorDim: number;
  private readonly maxAttempts: number;
  private readonly retryBaseMs: number;

  constructor(configService: ConfigService) {
    const batchSize =
      configService.get<number>('books.embeddingBatchSize') || 32;
    this.vectorDim = configService.get<number>('milvus.vectorDim') || 1_024;
    this.maxAttempts =
      configService.get<number>('books.embeddingMaxAttempts') || 3;
    this.retryBaseMs =
      configService.get<number>('books.embeddingRetryBaseMs') ?? 500;
    this.client = new OpenAIEmbeddings({
      apiKey: configService.get<string>('openai.apiKey'),
      model:
        configService.get<string>('openai.embeddingModel') ||
        'text-embedding-3-small',
      dimensions: this.vectorDim,
      batchSize,
      timeout: configService.get<number>('openai.requestTimeoutMs') || 20_000,
      maxRetries: 0,
      configuration: {
        baseURL: configService.get<string>('openai.baseUrl'),
      },
    });
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0 || texts.some((text) => !text.trim())) {
      throw new IngestionError(
        'EMBEDDING_UNAVAILABLE',
        '小说索引内容无效，请重新处理',
      );
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const vectors = await this.client.embedDocuments(texts);
        this.validateVectors(vectors, texts.length);
        return vectors;
      } catch (error) {
        lastError = error;
        if (attempt >= this.maxAttempts) break;
        this.logger.warn(`Embedding batch attempt ${attempt} failed; retrying`);
        await this.delay(this.retryBaseMs * 2 ** (attempt - 1));
      }
    }

    throw new IngestionError(
      'EMBEDDING_UNAVAILABLE',
      '暂时无法生成小说索引，请稍后重试',
      { cause: lastError },
    );
  }

  private validateVectors(vectors: number[][], expectedCount: number): void {
    if (
      vectors.length !== expectedCount ||
      vectors.some(
        (vector) =>
          vector.length !== this.vectorDim ||
          vector.some((value) => !Number.isFinite(value)),
      )
    ) {
      throw new Error('Embedding response shape is invalid');
    }
  }

  private delay(milliseconds: number): Promise<void> {
    if (milliseconds <= 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
