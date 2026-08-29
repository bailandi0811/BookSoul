import { ConfigService } from '@nestjs/config';
import { BookStatus, BookVisibility } from '@prisma/client';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { BookFileStorageService } from './book-file-storage.service';
import {
  SystemBookMigrationService,
  TIANLONG_SYSTEM_BOOK_ID,
} from './system-book-migration.service';

describe('SystemBookMigrationService', () => {
  let root: string;
  let sourcePath: string;
  let prisma: {
    book: { findUnique: jest.Mock; create: jest.Mock };
    chatSessionRecord: { findMany: jest.Mock };
    user: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: SystemBookMigrationService;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'booksoul-system-book-'));
    sourcePath = path.join(root, '天龙八部.epub');
    await writeFile(sourcePath, Buffer.from([0x50, 0x4b, 0x03, 0x04, 1]));
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'books.uploadDir') return path.join(root, 'storage');
        if (key === 'books.parserVersion') return 'parser-v1';
        if (key === 'books.embeddingVersion') return 'embedding-v1';
        return undefined;
      }),
    } as unknown as ConfigService;
    prisma = {
      book: { findUnique: jest.fn(), create: jest.fn() },
      chatSessionRecord: { findMany: jest.fn() },
      user: { findMany: jest.fn() },
      $transaction: jest.fn(),
    };
    prisma.book.findUnique.mockResolvedValue(null);
    prisma.book.create.mockImplementation(({ data }) => ({
      id: data.id,
      visibility: data.visibility,
      contentHash: data.contentHash,
      status: data.status,
    }));
    service = new SystemBookMigrationService(
      prisma as unknown as PrismaService,
      new BookFileStorageService(config),
      config,
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('creates the stable read-only system book and ingestion job', async () => {
    const result = await service.seedTianlong(sourcePath);

    expect(result).toMatchObject({
      id: TIANLONG_SYSTEM_BOOK_ID,
      visibility: BookVisibility.SYSTEM,
      status: BookStatus.QUEUED,
      created: true,
    });
    expect(prisma.book.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: TIANLONG_SYSTEM_BOOK_ID,
          ownerId: null,
          storageKey: `system/${TIANLONG_SYSTEM_BOOK_ID}/source.epub`,
          ingestionJob: { create: {} },
        }),
      }),
    );
  });

  it('is idempotent when the stable book already has the same content', async () => {
    const first = await service.seedTianlong(sourcePath);
    prisma.book.findUnique.mockResolvedValue({
      id: TIANLONG_SYSTEM_BOOK_ID,
      visibility: BookVisibility.SYSTEM,
      contentHash: first.contentHash,
      status: BookStatus.READY,
    });

    const result = await service.seedTianlong(sourcePath);

    expect(result).toMatchObject({ created: false, status: BookStatus.READY });
  });

  it('backfills only registered legacy owners and their recognized memories', async () => {
    prisma.book.findUnique.mockResolvedValue({
      id: TIANLONG_SYSTEM_BOOK_ID,
      title: '天龙八部',
      status: BookStatus.READY,
    });
    prisma.chatSessionRecord.findMany.mockResolvedValue([
      { ownerId: 'user-a', sessionId: 'session-a' },
      { ownerId: 'guest-a', sessionId: 'session-guest' },
    ]);
    prisma.user.findMany.mockResolvedValue([{ id: 'user-a' }]);
    const tx = {
      bookAssistant: {
        upsert: jest.fn().mockResolvedValue({ id: 'assistant-a' }),
      },
      readingProgress: { upsert: jest.fn().mockResolvedValue({}) },
      chatSessionRecord: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      memoryRecord: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    prisma.$transaction.mockImplementation((callback) => callback(tx));

    await expect(service.backfillLegacyTianlongSessions()).resolves.toEqual({
      sessionsUpdated: 1,
      memoriesUpdated: 2,
      skippedUnregisteredSessions: 1,
    });
    expect(tx.chatSessionRecord.updateMany).toHaveBeenCalledWith({
      where: {
        ownerId: 'user-a',
        sessionId: { in: ['session-a'] },
        bookAssistantId: null,
      },
      data: { bookAssistantId: 'assistant-a' },
    });
    expect(tx.memoryRecord.updateMany).toHaveBeenCalledWith({
      where: {
        ownerId: 'user-a',
        sessionId: { in: ['session-a'] },
        bookId: null,
        category: 'other',
      },
      data: { bookId: TIANLONG_SYSTEM_BOOK_ID },
    });
  });
});
