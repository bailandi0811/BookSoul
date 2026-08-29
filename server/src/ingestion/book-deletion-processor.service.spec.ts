import { BookFileStorageService } from '../books/book-file-storage.service';
import { BookVectorStoreService } from '../vector/book-vector-store.service';
import { BookDeletionProcessorService } from './book-deletion-processor.service';
import { IngestionJobRepository } from './ingestion-job.repository';
import type { ClaimedDeletionJob } from './ingestion-job.types';

describe('BookDeletionProcessorService', () => {
  let repository: {
    completeDeletion: jest.Mock;
    failDeletion: jest.Mock;
  };
  let vectorStore: { deleteBook: jest.Mock };
  let storage: { deleteByKey: jest.Mock };
  let service: BookDeletionProcessorService;

  beforeEach(() => {
    repository = {
      completeDeletion: jest.fn().mockResolvedValue(undefined),
      failDeletion: jest.fn().mockResolvedValue(undefined),
    };
    vectorStore = {
      deleteBook: jest.fn().mockResolvedValue(undefined),
    };
    storage = {
      deleteByKey: jest.fn().mockResolvedValue(undefined),
    };
    service = new BookDeletionProcessorService(
      repository as unknown as IngestionJobRepository,
      vectorStore as unknown as BookVectorStoreService,
      storage as unknown as BookFileStorageService,
    );
  });

  it('removes vectors and source before deleting the PostgreSQL book', async () => {
    await service.process(job());

    expect(vectorStore.deleteBook).toHaveBeenCalledWith('user-a', 'book-a');
    expect(storage.deleteByKey).toHaveBeenCalledWith(
      'private/user-a/book-a/source.txt',
    );
    expect(repository.completeDeletion).toHaveBeenCalledWith(job());
    expect(repository.failDeletion).not.toHaveBeenCalled();
  });

  it('leaves the book deleting and records a retryable cleanup failure', async () => {
    vectorStore.deleteBook.mockRejectedValue(new Error('unavailable'));

    await service.process(job());

    expect(storage.deleteByKey).not.toHaveBeenCalled();
    expect(repository.completeDeletion).not.toHaveBeenCalled();
    expect(repository.failDeletion).toHaveBeenCalledWith(job());
  });

  function job(): ClaimedDeletionJob {
    return {
      jobId: 'job-a',
      bookId: 'book-a',
      ownerScope: 'user-a',
      storageKey: 'private/user-a/book-a/source.txt',
    };
  }
});
