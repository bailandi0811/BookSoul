import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { BookReaderService } from './book-reader.service';
import { PrismaService } from '../prisma/prisma.service';

describe('protected section reading', () => {
  const text = '序章\n' + '正文😀\n'.repeat(18000);
  let prisma: {
    book: { findFirst: jest.Mock };
    bookSection: { findFirst: jest.Mock };
    bookChunk: { findFirst: jest.Mock };
  };
  let reader: BookReaderService;
  beforeEach(() => {
    prisma = {
      book: {
        findFirst: jest
          .fn()
          .mockResolvedValue({
            id: 'book',
            status: 'READY',
            embeddingVersion: 'v1',
          }),
      },
      bookSection: {
        findFirst: jest
          .fn()
          .mockResolvedValue({
            id: 'section',
            bookId: 'book',
            order: 1,
            title: '序章',
            content: text,
          }),
      },
      bookChunk: { findFirst: jest.fn() },
    };
    reader = new BookReaderService(prisma as unknown as PrismaService);
  });
  it('returns bounded windows whose actual ranges concatenate without damaging emoji', async () => {
    let offset = 0,
      joined = '';
    do {
      const window = await reader.getSectionWindow('owner', 'book', 'section', {
        offset,
        limit: 1024,
      });
      expect(window.text).toBe(
        text.slice(window.startOffset, window.endOffset),
      );
      expect(window.text.length).toBeLessThanOrEqual(1024);
      expect(window.text).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
      expect(window.contentHash).toMatch(/^[a-f0-9]{64}$/);
      joined += window.text;
      offset = window.nextOffset ?? text.length;
    } while (offset < text.length);
    expect(joined).toBe(text);
    expect(prisma.book.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'book',
          OR: [
            { ownerId: 'owner', visibility: 'PRIVATE' },
            { visibility: 'SYSTEM' },
          ],
        }),
      }),
    );
    expect(prisma.bookSection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'section',
          bookId: 'book',
          book: expect.objectContaining({
            status: 'READY',
            OR: expect.any(Array),
          }),
        }),
      }),
    );
  });
  it('uses the default 16000 limit and moves an offset inside a surrogate pair back safely', async () => {
    expect(
      (await reader.getSectionWindow('owner', 'book', 'section', {})).text
        .length,
    ).toBeLessThanOrEqual(16000);
    const emoji = text.indexOf('😀');
    expect(
      (
        await reader.getSectionWindow('owner', 'book', 'section', {
          offset: emoji + 1,
        })
      ).startOffset,
    ).toBe(emoji);
  });
  it.each([
    { offset: -1 },
    { offset: 0.2 },
    { offset: Number.MAX_SAFE_INTEGER + 1 },
    { offset: text.length + 1 },
    { limit: 32001 },
    { limit: 1 },
  ])('rejects invalid ranges %p', async (query) => {
    await expect(
      reader.getSectionWindow('owner', 'book', 'section', query),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('refuses foreign private books without reading a section', async () => {
    prisma.book.findFirst.mockResolvedValue(null);
    await expect(
      reader.getSectionWindow('other', 'book', 'section', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.bookSection.findFirst).not.toHaveBeenCalled();
  });
  it('refuses non-ready and cross-book chapters', async () => {
    prisma.book.findFirst.mockResolvedValue({ status: 'DELETING' });
    await expect(
      reader.getSectionWindow('owner', 'book', 'section', {}),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.bookSection.findFirst).not.toHaveBeenCalled();
    prisma.book.findFirst.mockResolvedValue({ status: 'READY' });
    prisma.bookSection.findFirst.mockResolvedValue(null);
    await expect(
      reader.getSectionWindow('owner', 'book', 'foreign', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('uses active-version chunk offsets, limits highlights, and never guesses repeated text', async () => {
    const start = text.indexOf('正文', 1000);
    prisma.bookChunk.findFirst.mockResolvedValue({
      sectionId: 'section',
      sectionOrder: 1,
      startOffset: start,
      endOffset: start + 800,
      content: text.slice(start, start + 800),
      section: { content: text },
    });
    const location = await reader.getReferenceLocation(
      'owner',
      'book',
      'chunk',
    );
    expect(location).toMatchObject({
      startOffset: start,
      precision: 'excerpt',
    });
    expect(location.endOffset - location.startOffset).toBeLessThanOrEqual(600);
    expect(prisma.bookChunk.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'chunk',
          bookId: 'book',
          embeddingVersion: 'v1',
          book: expect.objectContaining({ status: 'READY' }),
        }),
      }),
    );
    prisma.bookChunk.findFirst.mockResolvedValue({
      sectionId: 'section',
      sectionOrder: 1,
      startOffset: null,
      endOffset: null,
      content: '重复文本',
      section: { content: text },
    });
    expect(
      await reader.getReferenceLocation('owner', 'book', 'chunk'),
    ).toMatchObject({ startOffset: 0, endOffset: 0, precision: 'section' });
    prisma.bookChunk.findFirst.mockResolvedValue(null);
    await expect(
      reader.getReferenceLocation('owner', 'book', 'stale'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
