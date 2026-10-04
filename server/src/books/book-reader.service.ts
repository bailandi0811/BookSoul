import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookStatus, BookVisibility, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { ReferenceLocation, SectionWindow } from './book-reader.types';

@Injectable()
export class BookReaderService {
  constructor(private readonly prisma: PrismaService) {}
  accessibleBook(ownerId: string, bookId: string) {
    return {
      id: bookId,
      OR: [
        { ownerId, visibility: BookVisibility.PRIVATE },
        { visibility: BookVisibility.SYSTEM },
      ],
    };
  }

  async requireReadyBook(
    ownerId: string,
    bookId: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const book = await db.book.findFirst({
      where: this.accessibleBook(ownerId, bookId),
      select: { id: true, status: true, embeddingVersion: true },
    });
    if (!book) throw new NotFoundException('书籍不存在');
    if (book.status !== BookStatus.READY)
      throw new ConflictException('小说处理完成后才能阅读');
    return book;
  }

  async requireSection(
    ownerId: string,
    bookId: string,
    sectionId: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const section = await db.bookSection.findFirst({
      where: {
        id: sectionId,
        bookId,
        book: {
          ...this.accessibleBook(ownerId, bookId),
          status: BookStatus.READY,
        },
      },
      select: {
        id: true,
        bookId: true,
        order: true,
        title: true,
        content: true,
      },
    });
    if (!section) throw new NotFoundException('章节不存在');
    return section;
  }

  contentHash(text: string) {
    return createHash('sha256').update(text, 'utf8').digest('hex');
  }

  safeBoundary(text: string, offset: number) {
    const previous = text.charCodeAt(offset - 1),
      current = text.charCodeAt(offset);
    return previous >= 0xd800 &&
      previous <= 0xdbff &&
      current >= 0xdc00 &&
      current <= 0xdfff
      ? offset - 1
      : offset;
  }

  async getSectionWindow(
    ownerId: string,
    bookId: string,
    sectionId: string,
    query: { offset?: number; limit?: number },
  ): Promise<SectionWindow> {
    const offset = query.offset ?? 0,
      limit = query.limit ?? 16000;
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !Number.isSafeInteger(limit) ||
      limit < 1024 ||
      limit > 32000
    )
      throw new BadRequestException('正文范围无效');
    await this.requireReadyBook(ownerId, bookId);
    const section = await this.requireSection(ownerId, bookId, sectionId);
    if (offset > section.content.length)
      throw new BadRequestException('正文位置超出章节范围');
    const startOffset = this.safeBoundary(section.content, offset);
    const endOffset = this.safeBoundary(
      section.content,
      Math.min(startOffset + limit, section.content.length),
    );
    return {
      bookId,
      sectionId,
      sectionOrder: section.order,
      sectionTitle: section.title,
      contentHash: this.contentHash(section.content),
      totalLength: section.content.length,
      startOffset,
      endOffset,
      text: section.content.slice(startOffset, endOffset),
      nextOffset: endOffset < section.content.length ? endOffset : null,
    };
  }

  async getReferenceLocation(
    ownerId: string,
    bookId: string,
    chunkId: string,
  ): Promise<ReferenceLocation> {
    const book = await this.requireReadyBook(ownerId, bookId);
    const chunk = await this.prisma.bookChunk.findFirst({
      where: {
        id: chunkId,
        bookId,
        embeddingVersion: book.embeddingVersion,
        book: {
          ...this.accessibleBook(ownerId, bookId),
          status: BookStatus.READY,
        },
        section: { bookId },
      },
      select: {
        sectionId: true,
        sectionOrder: true,
        content: true,
        startOffset: true,
        endOffset: true,
        section: { select: { content: true } },
      },
    });
    if (!chunk) throw new NotFoundException('引用片段已不可用');
    const text = chunk.section.content;
    const base = {
      bookId,
      sectionId: chunk.sectionId,
      sectionOrder: chunk.sectionOrder,
      contentHash: this.contentHash(text),
    };
    const { startOffset: start, endOffset: end } = chunk;
    if (
      start === null ||
      end === null ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end <= start ||
      end > text.length ||
      text.slice(start, end) !== chunk.content
    )
      return { ...base, startOffset: 0, endOffset: 0, precision: 'section' };
    return {
      ...base,
      startOffset: this.safeBoundary(text, start),
      endOffset: this.safeBoundary(text, Math.min(end, start + 600)),
      precision: 'excerpt',
    };
  }
}
