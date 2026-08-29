import { BookFileStorageService } from '../books/book-file-storage.service';
import { BookParserService } from './book-parser.service';
import { BookVectorizationService } from './book-vectorization.service';
import { IngestionError } from './errors/ingestion-error';
import { IngestionJobRepository } from './ingestion-job.repository';
import {
  type ClaimedIngestionJob,
  IngestionLeaseLostError,
} from './ingestion-job.types';
import { IngestionProcessorService } from './ingestion-processor.service';
import { TextChunkerService } from './text-chunker.service';

describe('IngestionProcessorService', () => {
  let repository: {
    markChunking: jest.Mock;
    completeParsing: jest.Mock;
    fail: jest.Mock;
  };
  let storage: { withLocalPath: jest.Mock };
  let parser: { parse: jest.Mock };
  let chunker: { chunk: jest.Mock };
  let vectorization: { vectorize: jest.Mock };
  let processor: IngestionProcessorService;

  beforeEach(() => {
    repository = {
      markChunking: jest.fn().mockResolvedValue(undefined),
      completeParsing: jest.fn().mockResolvedValue(undefined),
      fail: jest.fn().mockResolvedValue(undefined),
    };
    storage = {
      withLocalPath: jest.fn(
        async (
          _key: string,
          operation: (filePath: string) => Promise<unknown>,
        ) => operation('trusted-source.txt'),
      ),
    };
    parser = {
      parse: jest.fn().mockResolvedValue({
        title: '测试书',
        sections: [{ order: 1, title: '第一章', content: '第一章正文' }],
      }),
    };
    chunker = {
      chunk: jest.fn().mockReturnValue([
        {
          chunkIndex: 0,
          content: '第一章正文',
          startOffset: 0,
          endOffset: 5,
        },
      ]),
    };
    vectorization = {
      vectorize: jest.fn().mockResolvedValue(undefined),
    };
    processor = new IngestionProcessorService(
      repository as unknown as IngestionJobRepository,
      storage as unknown as BookFileStorageService,
      parser as unknown as BookParserService,
      chunker as unknown as TextChunkerService,
      vectorization as unknown as BookVectorizationService,
    );
  });

  it('parses, chunks and persists a claimed job', async () => {
    const job = claimedJob();

    await processor.process(job);

    expect(storage.withLocalPath).toHaveBeenCalledWith(
      job.storageKey,
      expect.any(Function),
    );
    expect(parser.parse).toHaveBeenCalledWith({
      filePath: 'trusted-source.txt',
      originalFileName: 'book.txt',
    });
    expect(repository.markChunking).toHaveBeenCalledWith('job-a', 'book-a');
    expect(repository.completeParsing).toHaveBeenCalledWith(
      expect.objectContaining({
        job,
        parsed: expect.objectContaining({ title: '测试书' }),
        sections: [
          expect.objectContaining({
            order: 1,
            title: '第一章',
            charCount: 5,
          }),
        ],
        chunks: [
          expect.objectContaining({
            sectionOrder: 1,
            chunkIndex: 0,
            content: '第一章正文',
          }),
        ],
      }),
    );
    expect(repository.fail).not.toHaveBeenCalled();
    expect(vectorization.vectorize).toHaveBeenCalledWith(job);
  });

  it('stores parser failures using their stable public code', async () => {
    parser.parse.mockRejectedValue(
      new IngestionError('EMPTY_CONTENT', '小说正文为空'),
    );

    await processor.process(claimedJob());

    expect(repository.fail).toHaveBeenCalledWith(
      claimedJob(),
      'EMPTY_CONTENT',
      '小说正文为空',
    );
  });

  it('hides unexpected internal errors from persisted user messages', async () => {
    parser.parse.mockRejectedValue(
      new Error('C:\\secret\\private-source.txt failed'),
    );

    await processor.process(claimedJob());

    expect(repository.fail).toHaveBeenCalledWith(
      claimedJob(),
      'INTERNAL_PROCESSING_ERROR',
      '小说处理失败，请稍后重试',
    );
  });

  it('does not overwrite state after losing the job lease', async () => {
    repository.markChunking.mockRejectedValue(new IngestionLeaseLostError());

    await processor.process(claimedJob());

    expect(repository.completeParsing).not.toHaveBeenCalled();
    expect(vectorization.vectorize).not.toHaveBeenCalled();
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it('persists a stable vector-store failure without exposing internals', async () => {
    vectorization.vectorize.mockRejectedValue(
      new IngestionError(
        'VECTOR_STORE_UNAVAILABLE',
        '小说向量索引暂时不可用，请稍后重试',
      ),
    );

    await processor.process(claimedJob());

    expect(repository.fail).toHaveBeenCalledWith(
      claimedJob(),
      'VECTOR_STORE_UNAVAILABLE',
      '小说向量索引暂时不可用，请稍后重试',
    );
  });

  function claimedJob(): ClaimedIngestionJob {
    return {
      jobId: 'job-a',
      bookId: 'book-a',
      storageKey: 'private/user-a/book-a/source.txt',
      originalFileName: 'book.txt',
      embeddingVersion: 'book-embedding-v1',
    };
  }
});
