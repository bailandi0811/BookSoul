import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIEmbeddings } from '@langchain/openai';
import { IngestionError } from '../ingestion/errors/ingestion-error';

const DASHSCOPE_EMBEDDING_BATCH_LIMIT = 10;

@Injectable()
export class BookEmbeddingService {
  private readonly logger = new Logger(BookEmbeddingService.name);
  private readonly client: OpenAIEmbeddings;
  private readonly vectorDim: number;
  private readonly maxAttempts: number;
  private readonly retryBaseMs: number;

  constructor(configService: ConfigService) {
    const configuredBatchSize =
      configService.get<number>('books.embeddingBatchSize') || 32;
    const baseUrl = configService.get<string>('openai.baseUrl');
    const requestBatchSize = this.resolveRequestBatchSize(
      configuredBatchSize,
      baseUrl,
    );
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
      batchSize: requestBatchSize,
      timeout: configService.get<number>('openai.requestTimeoutMs') || 20_000,
      maxRetries: 0,
      configuration: {
        baseURL: baseUrl,
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
        const summary = this.safeErrorSummary(error);
        if (attempt >= this.maxAttempts || !this.isRetryable(error)) {
          this.logger.error(`Embedding batch failed (${summary})`);
          break;
        }
        this.logger.warn(
          `Embedding batch attempt ${attempt}/${this.maxAttempts} failed (${summary}); retrying`,
        );
        await this.delay(this.retryBaseMs * 2 ** (attempt - 1));
      }
    }

    throw new IngestionError(
      'EMBEDDING_UNAVAILABLE',
      this.safeFailureMessage(lastError),
      { cause: lastError },
    );
  }

  private resolveRequestBatchSize(
    configuredBatchSize: number,
    baseUrl: string | undefined,
  ): number {
    if (!baseUrl) return configuredBatchSize;
    try {
      const hostname = new URL(baseUrl).hostname.toLowerCase();
      const isDashScope =
        hostname === 'dashscope.aliyuncs.com' ||
        hostname.endsWith('.maas.aliyuncs.com');
      return isDashScope
        ? Math.min(configuredBatchSize, DASHSCOPE_EMBEDDING_BATCH_LIMIT)
        : configuredBatchSize;
    } catch {
      return configuredBatchSize;
    }
  }

  private isRetryable(error: unknown): boolean {
    const status = this.errorStatus(error);
    if (status !== null) {
      return status === 408 || status === 409 || status === 429 || status >= 500;
    }
    return this.errorName(error) !== 'AbortError';
  }

  private safeFailureMessage(error: unknown): string {
    const status = this.errorStatus(error);
    if (status === 400 || status === 404) {
      return '向量模型配置不兼容，请检查模型名称、维度和批次设置';
    }
    if (status === 401 || status === 403) {
      return '向量服务认证失败，请检查模型服务配置';
    }
    if (status === 429) {
      return '向量服务请求过多，请稍后重试';
    }
    return '暂时无法生成小说索引，请稍后重试';
  }

  private safeErrorSummary(error: unknown): string {
    const status = this.errorStatus(error);
    const name = this.errorName(error);
    return status === null ? `type=${name}` : `status=${status}, type=${name}`;
  }

  private errorStatus(error: unknown): number | null {
    if (!error || typeof error !== 'object' || !('status' in error)) {
      return null;
    }
    return typeof error.status === 'number' ? error.status : null;
  }

  private errorName(error: unknown): string {
    if (error instanceof Error && error.name) return error.name;
    return 'UnknownError';
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
