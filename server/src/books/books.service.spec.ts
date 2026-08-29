import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Book,
  BookStatus,
  BookVisibility,
  IngestionJobStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BookFileStorageService } from './book-file-storage.service';
import { BooksService } from './books.service';
import type { UploadedBookFile } from './books.types';

const now = new Date('2026-08-29T00:00:00.000Z');

function bookFixture(overrides: Partial<Book> = {}): Book {
  return {
    id: 'book-a',
    ownerId: 'user-a',
    visibility: BookVisibility.PRIVATE,
    title: '我的小说',
    author: null,
    originalFileName: '我的小说.txt',
    storageKey: 'private/user-a/book-a/source.txt',
    mimeType: 'text/plain',
    fileSizeBytes: 12n,
    contentHash: 'hash',
    language: null,
    coverStorageKey: null,
    status: BookStatus.QUEUED,
    statusProgress: 0,
    failureCode: null,
    failureMessage: null,
    sectionCount: 0,
    chunkCount: 0,
    parserVersion: 'book-parser-v1',
    embeddingVersion: 'book-embedding-v1',
    createdAt: now,
    updatedAt: now,
    readyAt: null,
    ...overrides,
  };
}

function txtFile(content = '第一章\n故事开始'): UploadedBookFile {
  const buffer = Buffer.from(content);
  return {
    originalname: '我的小说.txt',
    mimetype: 'text/plain',
    size: buffer.length,
    buffer,
  };
}

describe('BooksService', () => {
  let prisma: {
    book: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
    };
    ingestionJob: {
      upsert: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let storage: {
    save: jest.Mock;
    deleteByKey: jest.Mock;
  };
  let service: BooksService;

  beforeEach(() => {
    prisma = {
      book: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      ingestionJob: {
        upsert: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (operation: (tx: typeof prisma) => Promise<unknown>) =>
        operation(prisma),
    );
    storage = {
      save: jest.fn(),
      deleteByKey: jest.fn().mockResolvedValue(undefined),
    };
    service = new BooksService(
      prisma as unknown as PrismaService,
      storage as unknown as BookFileStorageService,
      {
        get: jest.fn((key: string) => {
          const values: Record<string, unknown> = {
            'books.maxUploadBytes': 20 * 1024 * 1024,
            'books.parserVersion': 'book-parser-v1',
            'books.embeddingVersion': 'book-embedding-v1',
          };
          return values[key];
        }),
      } as unknown as ConfigService,
    );
  });

  it('creates a queued private book and a durable ingestion job', async () => {
    prisma.book.findFirst.mockResolvedValue(null);
    storage.save.mockImplementation(
      async (ownerId: string, bookId: string) =>
        `private/${ownerId}/${bookId}/source.txt`,
    );
    prisma.book.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) =>
        bookFixture({
          id: String(data.id),
          ownerId: String(data.ownerId),
          storageKey: String(data.storageKey),
          fileSizeBytes: data.fileSizeBytes as bigint,
          contentHash: String(data.contentHash),
        }),
    );

    const result = await service.createFromUpload('user-a', txtFile());

    expect(storage.save).toHaveBeenCalledWith(
      'user-a',
      expect.any(String),
      'txt',
      expect.any(Buffer),
    );
    expect(prisma.book.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerId: 'user-a',
        visibility: BookVisibility.PRIVATE,
        status: BookStatus.QUEUED,
        parserVersion: 'book-parser-v1',
        embeddingVersion: 'book-embedding-v1',
        ingestionJob: { create: {} },
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        title: '我的小说',
        status: BookStatus.QUEUED,
        fileSizeBytes: txtFile().buffer.length,
        assistant: null,
      }),
    );
  });

  it('rejects duplicate content before writing another source file', async () => {
    prisma.book.findFirst.mockResolvedValue({ id: 'existing-book' });

    await expect(
      service.createFromUpload('user-a', txtFile()),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('restores UTF-8 filenames decoded as latin1 by multipart parsers', async () => {
    prisma.book.findFirst.mockResolvedValue(null);
    storage.save.mockResolvedValue('private/user-a/book-a/source.txt');
    prisma.book.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) =>
        bookFixture({
          id: String(data.id),
          ownerId: String(data.ownerId),
          title: String(data.title),
          originalFileName: String(data.originalFileName),
          storageKey: String(data.storageKey),
          fileSizeBytes: data.fileSizeBytes as bigint,
          contentHash: String(data.contentHash),
        }),
    );
    const file = txtFile();
    file.originalname = Buffer.from('雨夜来信.txt', 'utf8').toString('latin1');

    const result = await service.createFromUpload('user-a', file);

    expect(result).toMatchObject({
      title: '雨夜来信',
      originalFileName: '雨夜来信.txt',
    });
  });

  it('rejects invalid EPUB signatures before persistence', async () => {
    const invalid = txtFile('not a zip');
    invalid.originalname = 'fake.epub';
    invalid.mimetype = 'application/epub+zip';

    await expect(
      service.createFromUpload('user-a', invalid),
    ).rejects.toMatchObject({ response: { code: 'INVALID_EPUB' } });
    expect(prisma.book.findFirst).not.toHaveBeenCalled();
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('returns 404 for a book outside the authenticated scope', async () => {
    prisma.book.findFirst.mockResolvedValue(null);

    await expect(service.getById('user-a', 'book-b')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.book.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'book-b',
          OR: expect.arrayContaining([
            { ownerId: 'user-a', visibility: BookVisibility.PRIVATE },
          ]),
        }),
      }),
    );
  });

  it('does not allow deletion of the shared system example', async () => {
    prisma.book.findFirst.mockResolvedValue({
      ...bookFixture({
        ownerId: null,
        visibility: BookVisibility.SYSTEM,
      }),
      assistants: [],
      readingProgress: [],
    });

    await expect(service.delete('user-a', 'book-a')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(storage.deleteByKey).not.toHaveBeenCalled();
    expect(prisma.book.delete).not.toHaveBeenCalled();
  });

  it('queues durable cleanup after marking a private book deleting', async () => {
    const book = {
      ...bookFixture(),
      assistants: [],
      readingProgress: [],
    };
    prisma.book.findFirst.mockResolvedValue(book);
    prisma.book.updateMany.mockResolvedValue({ count: 1 });
    prisma.ingestionJob.upsert.mockResolvedValue({});

    await service.delete('user-a', 'book-a');

    expect(prisma.book.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'book-a',
        ownerId: 'user-a',
        status: { not: BookStatus.DELETING },
      },
      data: expect.objectContaining({ status: BookStatus.DELETING }),
    });
    expect(prisma.ingestionJob.upsert).toHaveBeenCalledWith({
      where: { bookId: 'book-a' },
      create: {
        bookId: 'book-a',
        status: IngestionJobStatus.QUEUED,
      },
      update: expect.objectContaining({ status: IngestionJobStatus.QUEUED }),
    });
    expect(storage.deleteByKey).not.toHaveBeenCalled();
    expect(prisma.book.delete).not.toHaveBeenCalled();
  });

  it('requeues failed cleanup when delete is repeated', async () => {
    prisma.book.findFirst.mockResolvedValue({
      ...bookFixture({ status: BookStatus.DELETING }),
      assistants: [],
      readingProgress: [],
    });
    prisma.ingestionJob.updateMany.mockResolvedValue({ count: 1 });

    await service.delete('user-a', 'book-a');

    expect(prisma.ingestionJob.updateMany).toHaveBeenCalledWith({
      where: {
        bookId: 'book-a',
        status: IngestionJobStatus.FAILED,
      },
      data: expect.objectContaining({ status: IngestionJobStatus.QUEUED }),
    });
    expect(prisma.book.updateMany).not.toHaveBeenCalled();
  });

  it('requeues a failed private book without trusting client ownership', async () => {
    const book = {
      ...bookFixture({ status: BookStatus.FAILED }),
      assistants: [],
      readingProgress: [],
    };
    prisma.book.findFirst.mockResolvedValue(book);
    prisma.book.updateMany.mockResolvedValue({ count: 1 });
    prisma.ingestionJob.upsert.mockResolvedValue({});

    const result = await service.retry('user-a', 'book-a');

    expect(prisma.book.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'book-a',
        ownerId: 'user-a',
        status: BookStatus.FAILED,
      },
      data: expect.objectContaining({
        status: BookStatus.QUEUED,
        failureCode: null,
        failureMessage: null,
      }),
    });
    expect(prisma.ingestionJob.upsert).toHaveBeenCalledWith({
      where: { bookId: 'book-a' },
      create: { bookId: 'book-a' },
      update: expect.objectContaining({ status: IngestionJobStatus.QUEUED }),
    });
    expect(result.id).toBe('book-a');
  });
});
