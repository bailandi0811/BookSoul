import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BookStatus, BookVisibility, ReadingMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BookReadingService } from './book-reading.service';

describe('BookReadingService', () => {
  let prisma: {
    book: { findFirst: jest.Mock };
    bookSection: { findMany: jest.Mock; count: jest.Mock };
    readingProgress: { upsert: jest.Mock };
  };
  let service: BookReadingService;

  beforeEach(() => {
    prisma = {
      book: { findFirst: jest.fn().mockResolvedValue(book()) },
      bookSection: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'section-a', order: 1, title: '第一章', charCount: 120 },
          ]),
        count: jest.fn().mockResolvedValue(1),
      },
      readingProgress: {
        upsert: jest.fn().mockResolvedValue(progress()),
      },
    };
    service = new BookReadingService(prisma as unknown as PrismaService);
  });

  it('returns only directory metadata and never full section content', async () => {
    await expect(service.listSections('user-a', 'book-a')).resolves.toEqual([
      { id: 'section-a', order: 1, title: '第一章', charCount: 120 },
    ]);
    expect(prisma.bookSection.findMany).toHaveBeenCalledWith({
      where: { bookId: 'book-a' },
      orderBy: { order: 'asc' },
      select: { id: true, order: true, title: true, charCount: true },
    });
  });

  it('defaults an untouched reader to a first-section spoiler ceiling', async () => {
    await expect(service.getProgress('user-a', 'book-a')).resolves.toEqual(
      expect.objectContaining({
        mode: ReadingMode.NOT_STARTED,
        currentSectionOrder: null,
        spoilerCeiling: 1,
      }),
    );
  });

  it('accepts an existing section for in-progress reading', async () => {
    prisma.readingProgress.upsert.mockResolvedValue(
      progress({
        mode: ReadingMode.IN_PROGRESS,
        currentSectionOrder: 2,
      }),
    );

    await expect(
      service.updateProgress('user-a', 'book-a', {
        mode: ReadingMode.IN_PROGRESS,
        currentSectionOrder: 2,
      }),
    ).resolves.toEqual(expect.objectContaining({ spoilerCeiling: 2 }));
    expect(prisma.bookSection.count).toHaveBeenCalledWith({
      where: { bookId: 'book-a', order: 2 },
    });
  });

  it('rejects missing or foreign sections for in-progress reading', async () => {
    await expect(
      service.updateProgress('user-a', 'book-a', {
        mode: ReadingMode.IN_PROGRESS,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.bookSection.count.mockResolvedValue(0);
    await expect(
      service.updateProgress('user-a', 'book-a', {
        mode: ReadingMode.IN_PROGRESS,
        currentSectionOrder: 99,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('computes a request-only spoiler override without changing progress', async () => {
    prisma.readingProgress.upsert.mockResolvedValue(
      progress({
        mode: ReadingMode.IN_PROGRESS,
        currentSectionOrder: 2,
      }),
    );

    await expect(
      service.getRetrievalBoundary('user-a', 'book-a', true),
    ).resolves.toEqual({
      ownerScope: 'user-a',
      bookId: 'book-a',
      embeddingVersion: 'book-embedding-v1',
      spoilerCeiling: 3,
    });
    expect(prisma.readingProgress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: {} }),
    );
  });

  it('does not reveal another user private book', async () => {
    prisma.book.findFirst.mockResolvedValue(null);
    await expect(
      service.getProgress('user-a', 'book-b'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.readingProgress.upsert).not.toHaveBeenCalled();
  });

  function book() {
    return {
      id: 'book-a',
      status: BookStatus.READY,
      sectionCount: 3,
      embeddingVersion: 'book-embedding-v1',
      visibility: BookVisibility.PRIVATE,
    };
  }

  function progress(overrides: Record<string, unknown> = {}) {
    return {
      mode: ReadingMode.NOT_STARTED,
      currentSectionOrder: null,
      updatedAt: new Date('2026-08-29T00:00:00.000Z'),
      ...overrides,
    };
  }
});
