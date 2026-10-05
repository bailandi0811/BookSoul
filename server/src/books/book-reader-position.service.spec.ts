import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { BookReaderPositionService } from './book-reader-position.service';
import { BookReaderService } from './book-reader.service';
import { PrismaService } from '../prisma/prisma.service';

describe('independent reader position CAS', () => {
  const row = {
    bookId: 'book',
    ownerId: 'owner',
    sectionId: 'section',
    offset: 2,
    contentHash: 'a'.repeat(64),
    revision: 1,
    updatedAt: new Date('2026-10-03T00:00:00Z'),
    section: { content: '合成正文' },
  };
  let prisma: {
    bookReadingPosition: {
      findFirst: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    readingProgress: {
      createMany: jest.Mock;
      updateMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let reader: {
    requireReadyBook: jest.Mock;
    requireSection: jest.Mock;
    contentHash: jest.Mock;
    safeBoundary: jest.Mock;
    accessibleBook: jest.Mock;
  };
  let positions: BookReaderPositionService;
  beforeEach(() => {
    prisma = {
      bookReadingPosition: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn().mockResolvedValue(row),
        create: jest.fn().mockResolvedValue(row),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      readingProgress: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          mode: 'IN_PROGRESS',
          currentSectionOrder: 18,
          updatedAt: new Date('2026-10-04T00:00:00Z'),
        }),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      (operation: (db: typeof prisma) => Promise<unknown>) => operation(prisma),
    );
    reader = {
      requireReadyBook: jest
        .fn()
        .mockResolvedValue({ status: 'READY', sectionCount: 40 }),
      requireSection: jest
        .fn()
        .mockResolvedValue({ content: '合成正文', order: 18 }),
      contentHash: jest.fn().mockReturnValue(row.contentHash),
      safeBoundary: jest.fn((_text: string, offset: number) => offset),
      accessibleBook: jest
        .fn()
        .mockReturnValue({
          id: 'book',
          OR: [
            { ownerId: 'owner', visibility: 'PRIVATE' },
            { visibility: 'SYSTEM' },
          ],
        }),
    };
    positions = new BookReaderPositionService(
      prisma as unknown as PrismaService,
      reader as unknown as BookReaderService,
    );
  });
  it('reads null without creating a position or reading progress', async () => {
    expect(await positions.getPosition('owner', 'book')).toBeNull();
    expect(prisma.bookReadingPosition.create).not.toHaveBeenCalled();
    expect(prisma.readingProgress.createMany).not.toHaveBeenCalled();
    expect(prisma.readingProgress.updateMany).not.toHaveBeenCalled();
  });
  it('scopes reads to owner/book and returns content changes without private owner identity', async () => {
    prisma.bookReadingPosition.findFirst.mockResolvedValue(row);
    reader.contentHash.mockReturnValue('b'.repeat(64));
    const result = await positions.getPosition('owner', 'book');
    expect(result).toMatchObject({ contentChanged: true, revision: 1 });
    expect(result).not.toHaveProperty('ownerId');
    expect(prisma.bookReadingPosition.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ ownerId: 'owner', bookId: 'book' }),
      }),
    );
  });
  it('creates revision one and rejects a competing first creation', async () => {
    const input = {
      sectionId: 'section',
      offset: 2,
      contentHash: row.contentHash,
      expectedRevision: 0,
    };
    expect(await positions.savePosition('owner', 'book', input)).toMatchObject({
      revision: 1,
      readingProgress: {
        mode: 'IN_PROGRESS',
        currentSectionOrder: 18,
        spoilerCeiling: 18,
        updatedAt: '2026-10-04T00:00:00.000Z',
      },
    });
    expect(prisma.readingProgress.createMany).toHaveBeenCalledWith({
      data: [
        {
          ownerId: 'owner',
          bookId: 'book',
          mode: 'IN_PROGRESS',
          currentSectionOrder: 18,
        },
      ],
      skipDuplicates: true,
    });
    expect(prisma.readingProgress.updateMany).toHaveBeenCalledWith({
      where: {
        ownerId: 'owner',
        bookId: 'book',
        NOT: { mode: 'FINISHED' },
        OR: [
          { mode: 'NOT_STARTED' },
          { currentSectionOrder: null },
          { currentSectionOrder: { lt: 18 } },
        ],
      },
      data: { mode: 'IN_PROGRESS', currentSectionOrder: 18 },
    });
    expect(prisma.bookReadingPosition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: 'owner',
          bookId: 'book',
          revision: 1,
        }),
      }),
    );
    prisma.bookReadingPosition.create.mockRejectedValue({ code: 'P2002' });
    await expect(
      positions.savePosition('owner', 'book', input),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.readingProgress.createMany).toHaveBeenCalledTimes(1);
  });
  it('keeps a finished book finished when a later position is saved', async () => {
    prisma.readingProgress.findUniqueOrThrow.mockResolvedValue({
      mode: 'FINISHED',
      currentSectionOrder: 40,
      updatedAt: new Date('2026-10-04T00:00:00Z'),
    });
    await expect(
      positions.savePosition('owner', 'book', {
        sectionId: 'section',
        offset: 2,
        contentHash: row.contentHash,
        expectedRevision: 0,
      }),
    ).resolves.toMatchObject({
      readingProgress: { mode: 'FINISHED', spoilerCeiling: 40 },
    });
  });
  it('performs atomic owner/book/revision update and refuses zero matched rows', async () => {
    const input = {
      sectionId: 'section',
      offset: 2,
      contentHash: row.contentHash,
      expectedRevision: 1,
    };
    await positions.savePosition('owner', 'book', input);
    expect(prisma.bookReadingPosition.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: 'owner', bookId: 'book', revision: 1 },
        data: expect.objectContaining({ revision: { increment: 1 } }),
      }),
    );
    prisma.bookReadingPosition.updateMany.mockResolvedValue({ count: 0 });
    prisma.readingProgress.createMany.mockClear();
    await expect(
      positions.savePosition('owner', 'book', input),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'READER_POSITION_CONFLICT' }),
    });
    expect(prisma.readingProgress.createMany).not.toHaveBeenCalled();
  });
  it('rejects changed content and invalid offsets before writing', async () => {
    await expect(
      positions.savePosition('owner', 'book', {
        sectionId: 'section',
        offset: 0,
        contentHash: 'b'.repeat(64),
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'READER_CONTENT_CHANGED' }),
    });
    await expect(
      positions.savePosition('owner', 'book', {
        sectionId: 'section',
        offset: -1,
        contentHash: row.contentHash,
        expectedRevision: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      positions.savePosition('owner', 'book', {
        sectionId: 'section',
        offset: 100,
        contentHash: row.contentHash,
        expectedRevision: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.bookReadingPosition.updateMany).not.toHaveBeenCalled();
    expect(prisma.readingProgress.createMany).not.toHaveBeenCalled();
  });
  it('refuses foreign chapters and non-ready books without a position write', async () => {
    reader.requireSection.mockRejectedValue(new NotFoundException());
    await expect(
      positions.savePosition('owner', 'book', {
        sectionId: 'foreign',
        offset: 0,
        contentHash: row.contentHash,
        expectedRevision: 0,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    reader.requireReadyBook.mockRejectedValue(new ConflictException());
    await expect(positions.getPosition('owner', 'book')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.bookReadingPosition.create).not.toHaveBeenCalled();
  });
});
