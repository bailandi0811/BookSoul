import { ConfigService } from '@nestjs/config';
import type { BookUploadSession } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BookObjectStorageService } from './book-object-storage.service';
import { BooksService } from './books.service';
import { BookUploadsService } from './book-uploads.service';

const hash = 'a'.repeat(64);
const id = '11111111-1111-4111-8111-111111111111';
function fixture(
  overrides: Partial<BookUploadSession> = {},
): BookUploadSession {
  return {
    id,
    ownerId: 'owner-a',
    requestId: id,
    originalFileName: 'novel.txt',
    declaredBytes: 12,
    declaredHash: hash,
    mimeType: 'text/plain',
    stagingKey: `booksoul/books/staging/${id}/source.txt`,
    multipartId: null,
    partSize: null,
    status: 'UPLOADING',
    expiresAt: new Date(Date.now() + 86400000),
    leaseToken: null,
    leaseExpiresAt: null,
    bookId: null,
    cleanupKeys: [],
    cleanedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
describe('BookUploadsService', () => {
  const sessions = {
    count: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    findFirstOrThrow: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  };
  const book = {
    aggregate: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  };
  const tx = { bookUploadSession: sessions, book, $queryRaw: jest.fn() };
  const prisma = { ...tx, $transaction: jest.fn() };
  const objects = {
    configured: true,
    head: jest.fn(),
    snapshot: jest.fn(),
    withFile: jest.fn(),
    postTicket: jest.fn(),
    initialize: jest.fn(),
    parts: jest.fn(),
    complete: jest.fn(),
    abort: jest.fn(),
    delete: jest.fn(),
  };
  const books = { getById: jest.fn(), describeSource: jest.fn() };
  let service: BookUploadsService;
  beforeEach(() => {
    jest.resetAllMocks();
    tx.$queryRaw.mockImplementation((sql: TemplateStringsArray) => {
      if (
        sql.join('').includes('pg_advisory_xact_lock') &&
        !sql.join('').includes('::text')
      ) {
        throw Object.assign(new Error('Unsupported void result'), {
          code: 'P2010',
        });
      }
      return Promise.resolve([{ id: 'owner-a' }]);
    });
    prisma.$transaction.mockImplementation(
      (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
    );
    sessions.findFirst.mockResolvedValue(fixture());
    sessions.findUniqueOrThrow.mockResolvedValue(fixture());
    sessions.updateMany.mockResolvedValue({ count: 1 });
    sessions.count.mockResolvedValue(0);
    sessions.findMany.mockResolvedValue([]);
    book.aggregate.mockResolvedValue({ _sum: { fileSizeBytes: 0n } });
    objects.head.mockResolvedValue({ size: 12, etag: 'revision-a' });
    objects.withFile.mockImplementation(
      (_key: string, fn: (file: unknown) => Promise<unknown>) =>
        fn({ size: 12, sha256: hash, prefix: Buffer.from('hello') }),
    );
    books.describeSource.mockReturnValue({
      title: 'novel',
      originalFileName: 'novel.txt',
      canonicalMimeType: 'text/plain',
      size: 12,
    });
    book.create.mockResolvedValue({ id: 'book-a' });
    books.getById.mockResolvedValue({ id: 'book-a' });
    service = new BookUploadsService(
      prisma as unknown as PrismaService,
      objects as unknown as BookObjectStorageService,
      books as unknown as BooksService,
      { get: jest.fn() } as unknown as ConfigService,
    );
  });
  it('rejects other owners before touching OSS', async () => {
    sessions.findFirst.mockResolvedValue(null);
    await expect(service.commit('owner-b', id)).rejects.toMatchObject({
      status: 404,
    });
    expect(sessions.findFirst).toHaveBeenCalledWith({
      where: { id, ownerId: 'owner-b' },
    });
    expect(objects.head).not.toHaveBeenCalled();
  });
  it('returns a committed book without transferring or rebuilding it', async () => {
    sessions.findFirst.mockResolvedValue(
      fixture({ status: 'COMMITTED', bookId: 'book-a' }),
    );
    await expect(service.commit('owner-a', id)).resolves.toEqual({
      id: 'book-a',
    });
    expect(objects.head).not.toHaveBeenCalled();
    expect(book.create).not.toHaveBeenCalled();
  });
  it('validates a snapshot and atomically registers its source and durable job', async () => {
    await service.commit('owner-a', id);
    expect(objects.snapshot).toHaveBeenCalledWith(
      fixture().stagingKey,
      expect.stringContaining('/sources/'),
      'revision-a',
    );
    expect(book.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: 'owner-a',
          contentHash: hash,
          storageKey: expect.stringMatching(/^oss:booksoul\/books\/sources\//),
          ingestionJob: { create: {} },
        }),
      }),
    );
    expect(sessions.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'COMMITTED',
          bookId: 'book-a',
        }),
      }),
    );
  });
  it('reuses a same-owner duplicate after server-side validation', async () => {
    book.findFirst.mockResolvedValue({ id: 'existing', status: 'READY' });
    await service.commit('owner-a', id);
    expect(book.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: 'owner-a', contentHash: hash },
      }),
    );
    expect(book.create).not.toHaveBeenCalled();
    expect(books.getById).toHaveBeenCalledWith('owner-a', 'existing');
  });
  it('rejects false client hashes and retains cleanup bookkeeping', async () => {
    objects.withFile.mockImplementation(
      (_key: string, fn: (file: unknown) => Promise<unknown>) =>
        fn({ size: 12, sha256: 'b'.repeat(64), prefix: Buffer.from('hello') }),
    );
    await expect(service.commit('owner-a', id)).rejects.toMatchObject({
      status: 422,
    });
    expect(book.create).not.toHaveBeenCalled();
    expect(objects.delete).not.toHaveBeenCalled();
  });
  it('does not create records after the confirmation lease is reclaimed', async () => {
    sessions.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    await expect(service.commit('owner-a', id)).rejects.toMatchObject({
      status: 409,
    });
    expect(book.create).not.toHaveBeenCalled();
  });
  it('enforces the upload quota under the owner row lock', async () => {
    sessions.findMany.mockResolvedValue([
      { declaredBytes: 12 },
      { declaredBytes: 12 },
    ]);
    await expect(
      service.create('owner-a', {
        requestId: id,
        fileName: 'novel.txt',
        byteSize: 12,
        sha256: hash,
      }),
    ).rejects.toMatchObject({ status: 429 });
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(sessions.create).not.toHaveBeenCalled();
  });
  it('does not accept different content under an existing idempotency key', async () => {
    sessions.findUnique.mockResolvedValue(
      fixture({ declaredHash: 'b'.repeat(64) }),
    );
    await expect(
      service.create('owner-a', {
        requestId: id,
        fileName: 'novel.txt',
        byteSize: 12,
        sha256: hash,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('rejects missing or malformed multipart uploads before merging', async () => {
    sessions.findFirst.mockResolvedValue(
      fixture({ partSize: 5 * 1024 ** 2, multipartId: 'multipart' }),
    );
    objects.head.mockResolvedValue(null);
    objects.parts.mockResolvedValue([]);
    await expect(service.commit('owner-a', id)).rejects.toMatchObject({
      status: 409,
    });
    expect(objects.complete).not.toHaveBeenCalled();
  });
  it('does not cancel an actively confirming session', async () => {
    sessions.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.cancel('owner-a', id)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('cleans only recorded temporary candidates, preserving the committed source', async () => {
    const unused =
      'booksoul/books/sources/22222222-2222-4222-8222-222222222222/source.txt';
    sessions.findMany.mockResolvedValue([
      fixture({
        status: 'COMMITTED',
        bookId: 'book-a',
        cleanupKeys: [unused],
        multipartId: 'completed-upload',
      }),
    ]);
    await expect(service.cleanupExpired()).resolves.toBe(1);
    expect(objects.delete.mock.calls.map((call) => call[0])).toEqual([
      fixture().stagingKey,
      unused,
    ]);
    expect(sessions.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ leaseExpiresAt: null }]),
        }),
      }),
    );
  });

  it('expires a committed resume ticket when its original book has been deleted', async () => {
    sessions.findFirst.mockResolvedValue(
      fixture({ status: 'COMMITTED', bookId: 'removed' }),
    );
    book.findFirst.mockResolvedValue(null);
    await expect(service.get('owner-a', id)).rejects.toMatchObject({
      status: 410,
    });
    expect(objects.head).not.toHaveBeenCalled();
  });
});
