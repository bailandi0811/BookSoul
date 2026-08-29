import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DataType,
  IndexType,
  MetricType,
  type MilvusClient,
} from '@zilliz/milvus2-sdk-node';
import { IngestionError } from '../ingestion/errors/ingestion-error';
import { MilvusService } from '../milvus/milvus.service';
import type {
  BookVectorRecord,
  BookVectorSearchHit,
  BookVectorScope,
} from './book-vector.types';

const SAFE_SCOPE_VALUE = /^[A-Za-z0-9_.:-]{1,128}$/;
const REQUIRED_FIELDS = [
  'id',
  'owner_scope',
  'book_id',
  'section_id',
  'section_order',
  'chunk_index',
  'embedding_version',
  'vector',
] as const;

@Injectable()
export class BookVectorStoreService {
  private readonly collectionName: string;
  private readonly vectorDim: number;
  private readonly timeoutMs: number;
  private ensurePromise: Promise<void> | null = null;

  constructor(
    configService: ConfigService,
    private readonly milvusService: MilvusService,
  ) {
    this.collectionName =
      configService.get<string>('milvus.bookCollectionName') ||
      'book_chunks_v2';
    this.vectorDim = configService.get<number>('milvus.vectorDim') || 1_024;
    this.timeoutMs =
      configService.get<number>('milvus.requestTimeoutMs') || 8_000;
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,254}$/.test(this.collectionName)) {
      throw new Error('Invalid Milvus book collection name');
    }
  }

  async ensureCollection(): Promise<void> {
    if (!this.ensurePromise) {
      this.ensurePromise = this.ensureCollectionInternal().catch((error) => {
        this.ensurePromise = null;
        throw this.vectorStoreError(error);
      });
    }
    return this.ensurePromise;
  }

  async replaceVersionStart(scope: BookVectorScope): Promise<void> {
    await this.ensureCollection();
    await this.deleteByFilter(this.versionFilter(scope));
  }

  async insert(records: BookVectorRecord[]): Promise<void> {
    if (records.length === 0) return;
    for (const record of records) {
      this.validateScope(record);
      if (record.vector.length !== this.vectorDim) {
        throw new IngestionError(
          'VECTOR_STORE_UNAVAILABLE',
          '小说索引向量维度不匹配，请稍后重试',
        );
      }
    }

    try {
      const result = await this.client().insert({
        collection_name: this.collectionName,
        data: records.map((record) => ({
          id: record.id,
          owner_scope: record.ownerScope,
          book_id: record.bookId,
          section_id: record.sectionId,
          section_order: record.sectionOrder,
          chunk_index: record.chunkIndex,
          embedding_version: record.embeddingVersion,
          vector: record.vector,
        })),
        timeout: this.timeoutMs,
      });
      if (Number(result.insert_cnt) !== records.length) {
        throw new Error('Milvus inserted row count does not match request');
      }
    } catch (error) {
      throw this.vectorStoreError(error);
    }
  }

  async flush(): Promise<void> {
    try {
      await this.client().flush({
        collection_names: [this.collectionName],
        timeout: this.timeoutMs,
      });
    } catch (error) {
      throw this.vectorStoreError(error);
    }
  }

  async countVersion(scope: BookVectorScope): Promise<number> {
    await this.ensureCollection();
    try {
      const result = await this.client().count({
        collection_name: this.collectionName,
        expr: this.versionFilter(scope),
        timeout: this.timeoutMs,
      });
      const count = Number(result.data);
      if (!Number.isSafeInteger(count) || count < 0) {
        throw new Error('Milvus returned an invalid count');
      }
      return count;
    } catch (error) {
      throw this.vectorStoreError(error);
    }
  }

  async searchChunkIds(
    scope: BookVectorScope,
    vector: number[],
    spoilerCeiling: number,
    limit: number,
  ): Promise<BookVectorSearchHit[]> {
    this.versionFilter(scope);
    if (vector.length !== this.vectorDim) {
      throw new IngestionError(
        'VECTOR_STORE_UNAVAILABLE',
        '查询向量维度不匹配，请稍后重试',
      );
    }
    if (
      !Number.isSafeInteger(spoilerCeiling) ||
      spoilerCeiling < 1 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 50
    ) {
      throw new Error('Invalid server-derived vector search boundary');
    }
    await this.ensureCollection();
    try {
      const result = await this.client().search({
        collection_name: this.collectionName,
        vector,
        limit,
        metric_type: MetricType.COSINE,
        filter: `${this.versionFilter(scope)} && section_order <= ${spoilerCeiling}`,
        output_fields: ['id'],
        timeout: this.timeoutMs,
      });
      return (result.results || [])
        .map((hit) => ({ id: String(hit.id), score: Number(hit.score) }))
        .filter(
          (hit) => SAFE_SCOPE_VALUE.test(hit.id) && Number.isFinite(hit.score),
        );
    } catch (error) {
      throw this.vectorStoreError(error);
    }
  }

  async deleteVersion(scope: BookVectorScope): Promise<void> {
    if (!(await this.collectionExists())) return;
    await this.deleteByFilter(this.versionFilter(scope));
  }

  async deleteBook(ownerScope: string, bookId: string): Promise<void> {
    this.validateScope({ ownerScope, bookId });
    if (!(await this.collectionExists())) return;
    await this.deleteByFilter(
      `owner_scope == "${ownerScope}" && book_id == "${bookId}"`,
    );
  }

  private async ensureCollectionInternal(): Promise<void> {
    const client = this.client();
    const exists = await client.hasCollection({
      collection_name: this.collectionName,
      timeout: this.timeoutMs,
    });
    if (!exists.value) {
      await client.createCollection({
        collection_name: this.collectionName,
        description: 'BookSoul private book chunk vectors',
        enable_dynamic_field: false,
        fields: [
          {
            name: 'id',
            data_type: DataType.VarChar,
            max_length: 64,
            is_primary_key: true,
          },
          {
            name: 'owner_scope',
            data_type: DataType.VarChar,
            max_length: 128,
          },
          {
            name: 'book_id',
            data_type: DataType.VarChar,
            max_length: 64,
          },
          {
            name: 'section_id',
            data_type: DataType.VarChar,
            max_length: 64,
          },
          { name: 'section_order', data_type: DataType.Int32 },
          { name: 'chunk_index', data_type: DataType.Int32 },
          {
            name: 'embedding_version',
            data_type: DataType.VarChar,
            max_length: 128,
          },
          {
            name: 'vector',
            data_type: DataType.FloatVector,
            dim: this.vectorDim,
          },
        ],
        timeout: this.timeoutMs,
      });
      await client.createIndex({
        collection_name: this.collectionName,
        field_name: 'vector',
        index_name: `${this.collectionName}_vector_idx`,
        index_type: IndexType.HNSW,
        metric_type: MetricType.COSINE,
        params: { M: 16, efConstruction: 200 },
        timeout: this.timeoutMs,
      });
    } else {
      await this.validateCollectionSchema();
    }
    await client.loadCollection({
      collection_name: this.collectionName,
      timeout: this.timeoutMs,
    });
  }

  private async validateCollectionSchema(): Promise<void> {
    const description = await this.client().describeCollection({
      collection_name: this.collectionName,
      timeout: this.timeoutMs,
    });
    const fields = description.schema.fields;
    for (const name of REQUIRED_FIELDS) {
      if (!fields.some((field) => field.name === name)) {
        throw new Error(`Milvus collection is missing required field ${name}`);
      }
    }
    const vectorField = fields.find((field) => field.name === 'vector');
    const actualDim = Number(vectorField?.dim);
    if (actualDim !== this.vectorDim) {
      throw new Error('Milvus book collection vector dimension mismatch');
    }
  }

  private async collectionExists(): Promise<boolean> {
    try {
      const result = await this.client().hasCollection({
        collection_name: this.collectionName,
        timeout: this.timeoutMs,
      });
      return Boolean(result.value);
    } catch (error) {
      throw this.vectorStoreError(error);
    }
  }

  private async deleteByFilter(filter: string): Promise<void> {
    try {
      await this.client().delete({
        collection_name: this.collectionName,
        filter,
        consistency_level: 'Strong',
        timeout: this.timeoutMs,
      });
      await this.flush();
    } catch (error) {
      throw this.vectorStoreError(error);
    }
  }

  private versionFilter(scope: BookVectorScope): string {
    this.validateScope(scope);
    return `owner_scope == "${scope.ownerScope}" && book_id == "${scope.bookId}" && embedding_version == "${scope.embeddingVersion}"`;
  }

  private validateScope(scope: {
    ownerScope: string;
    bookId: string;
    embeddingVersion?: string;
  }): void {
    for (const value of [
      scope.ownerScope,
      scope.bookId,
      ...(scope.embeddingVersion ? [scope.embeddingVersion] : []),
    ]) {
      if (!SAFE_SCOPE_VALUE.test(value)) {
        throw new Error('Unsafe Milvus book scope value');
      }
    }
  }

  private client(): MilvusClient {
    return this.milvusService.getClient();
  }

  private vectorStoreError(error: unknown): IngestionError {
    if (error instanceof IngestionError) return error;
    return new IngestionError(
      'VECTOR_STORE_UNAVAILABLE',
      '小说向量索引暂时不可用，请稍后重试',
      { cause: error },
    );
  }
}
