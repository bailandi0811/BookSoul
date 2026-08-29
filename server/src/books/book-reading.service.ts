import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookStatus, BookVisibility, ReadingMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateReadingProgressDto } from './dto/update-reading-progress.dto';
import { calculateSpoilerCeiling } from './reading-progress.policy';

const PROGRESS_SELECT = {
  mode: true,
  currentSectionOrder: true,
  updatedAt: true,
} as const;

@Injectable()
export class BookReadingService {
  constructor(private readonly prisma: PrismaService) {}

  async listSections(ownerId: string, bookId: string) {
    await this.requireReadyBook(ownerId, bookId);
    return this.prisma.bookSection.findMany({
      where: { bookId },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        order: true,
        title: true,
        charCount: true,
      },
    });
  }

  async getProgress(ownerId: string, bookId: string) {
    const book = await this.requireReadyBook(ownerId, bookId);
    const progress = await this.ensureProgress(ownerId, book.id);
    return {
      ...progress,
      spoilerCeiling: calculateSpoilerCeiling(progress, book.sectionCount),
    };
  }

  async updateProgress(
    ownerId: string,
    bookId: string,
    input: UpdateReadingProgressDto,
  ) {
    const book = await this.requireReadyBook(ownerId, bookId);
    const currentSectionOrder = await this.normalizeSectionOrder(
      book.id,
      book.sectionCount,
      input,
    );
    const progress = await this.prisma.readingProgress.upsert({
      where: { ownerId_bookId: { ownerId, bookId: book.id } },
      create: {
        ownerId,
        bookId: book.id,
        mode: input.mode,
        currentSectionOrder,
      },
      update: {
        mode: input.mode,
        currentSectionOrder,
      },
      select: PROGRESS_SELECT,
    });
    return {
      ...progress,
      spoilerCeiling: calculateSpoilerCeiling(progress, book.sectionCount),
    };
  }

  async getRetrievalBoundary(
    ownerId: string,
    bookId: string,
    spoilerOverride = false,
  ) {
    const book = await this.requireReadyBook(ownerId, bookId);
    const progress = await this.ensureProgress(ownerId, book.id);
    const ownerScope =
      book.visibility === BookVisibility.SYSTEM ? '__system__' : ownerId;
    return {
      ownerScope,
      bookId: book.id,
      embeddingVersion: book.embeddingVersion,
      spoilerCeiling: calculateSpoilerCeiling(
        progress,
        book.sectionCount,
        spoilerOverride,
      ),
    };
  }

  private async normalizeSectionOrder(
    bookId: string,
    sectionCount: number,
    input: UpdateReadingProgressDto,
  ): Promise<number | null> {
    if (input.mode === ReadingMode.NOT_STARTED) {
      if (input.currentSectionOrder != null) {
        throw new BadRequestException('未开始阅读时不能指定当前章节');
      }
      return null;
    }
    if (input.mode === ReadingMode.FINISHED) {
      if (
        input.currentSectionOrder != null &&
        input.currentSectionOrder !== sectionCount
      ) {
        throw new BadRequestException('已读完状态的章节必须是最后一章');
      }
      return sectionCount;
    }
    if (input.currentSectionOrder == null) {
      throw new BadRequestException('阅读中状态必须指定当前章节');
    }
    const exists = await this.prisma.bookSection.count({
      where: { bookId, order: input.currentSectionOrder },
    });
    if (exists !== 1) {
      throw new BadRequestException('当前章节不属于这本书');
    }
    return input.currentSectionOrder;
  }

  private ensureProgress(ownerId: string, bookId: string) {
    return this.prisma.readingProgress.upsert({
      where: { ownerId_bookId: { ownerId, bookId } },
      create: { ownerId, bookId, mode: ReadingMode.NOT_STARTED },
      update: {},
      select: PROGRESS_SELECT,
    });
  }

  private async requireReadyBook(ownerId: string, bookId: string) {
    const book = await this.prisma.book.findFirst({
      where: {
        id: bookId,
        OR: [
          { ownerId, visibility: BookVisibility.PRIVATE },
          { visibility: BookVisibility.SYSTEM },
        ],
      },
      select: {
        id: true,
        status: true,
        sectionCount: true,
        embeddingVersion: true,
        visibility: true,
      },
    });
    if (!book) throw new NotFoundException('书籍不存在');
    if (book.status !== BookStatus.READY) {
      throw new ConflictException('小说处理完成后才能设置阅读进度');
    }
    return book;
  }
}
