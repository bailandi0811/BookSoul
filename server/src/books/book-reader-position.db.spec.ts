import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { resolveIsolatedDatabaseUrl } from '../prisma/testing/isolated-database';
import { PrismaService } from '../prisma/prisma.service';
import { BookReaderService } from './book-reader.service';
import { BookReaderPositionService } from './book-reader-position.service';

describe('reader CAS in an explicitly isolated PostgreSQL database', () => {
  let db: PrismaClient | undefined;
  let positions: BookReaderPositionService;
  const ownerId = randomUUID(),
    bookId = randomUUID(),
    sectionId = randomUUID();
  beforeAll(async () => {
    const url = resolveIsolatedDatabaseUrl(process.env);
    db = new PrismaClient({ datasources: { db: { url } } });
    await db.user.create({
      data: {
        id: ownerId,
        email: `reader-${ownerId}@example.invalid`,
        name: 'Synthetic reader',
        passwordHash: 'synthetic-fixture',
      },
    });
    await db.book.create({
      data: {
        id: bookId,
        ownerId,
        title: '合成小说',
        originalFileName: 'synthetic.txt',
        storageKey: `reader-fixture-${bookId}`,
        mimeType: 'text/plain',
        fileSizeBytes: 4,
        contentHash: bookId,
        parserVersion: 'fixture',
        embeddingVersion: 'fixture',
        status: 'READY',
        sectionCount: 1,
      },
    });
    await db.bookSection.create({
      data: {
        id: sectionId,
        bookId,
        order: 1,
        title: '合成第一节',
        content: '合成正文',
        charCount: 4,
      },
    });
    const prisma = db as unknown as PrismaService;
    positions = new BookReaderPositionService(
      prisma,
      new BookReaderService(prisma),
    );
  });
  afterAll(async () => {
    if (!db) return;
    await db.user.deleteMany({
      where: { id: ownerId, email: `reader-${ownerId}@example.invalid` },
    });
    await db.$disconnect();
  });
  it('allows exactly one first creator and one updater for a given revision', async () => {
    const contentHash = new BookReaderService(
      db as unknown as PrismaService,
    ).contentHash('合成正文');
    const save = (expectedRevision: number) =>
      positions.savePosition(ownerId, bookId, {
        sectionId,
        offset: 1,
        contentHash,
        expectedRevision,
      });
    const first = await Promise.allSettled([save(0), save(0)]);
    expect(
      first.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const next = await Promise.allSettled([save(1), save(1)]);
    expect(next.filter((result) => result.status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(await positions.getPosition(ownerId, bookId)).toMatchObject({
      revision: 2,
    });
    expect(
      await db!.readingProgress.findUnique({
        where: { ownerId_bookId: { ownerId, bookId } },
      }),
    ).toMatchObject({ mode: 'IN_PROGRESS', currentSectionOrder: 1 });
  });
  it('cascades section deletion only for this synthetic fixture', async () => {
    await db!.bookSection.deleteMany({ where: { id: sectionId, bookId } });
    expect(
      await db!.bookReadingPosition.count({ where: { ownerId, bookId } }),
    ).toBe(0);
  });
});
