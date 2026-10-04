import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookReaderService } from './book-reader.service';
import type {
  ReaderPosition,
  SaveReaderPositionInput,
} from './book-reader.types';

@Injectable()
export class BookReaderPositionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reader: BookReaderService,
  ) {}
  async getPosition(
    ownerId: string,
    bookId: string,
  ): Promise<ReaderPosition | null> {
    await this.reader.requireReadyBook(ownerId, bookId);
    const row = await this.prisma.bookReadingPosition.findFirst({
      where: {
        ownerId,
        bookId,
        section: { bookId },
        book: {
          ...this.reader.accessibleBook(ownerId, bookId),
          status: 'READY',
        },
      },
      include: { section: { select: { content: true } } },
    });
    if (!row) return null;
    return this.toPosition(
      row,
      row.contentHash !== this.reader.contentHash(row.section.content),
    );
  }

  async savePosition(
    ownerId: string,
    bookId: string,
    input: SaveReaderPositionInput,
  ): Promise<ReaderPosition> {
    if (
      !Number.isSafeInteger(input.offset) ||
      input.offset < 0 ||
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 0
    )
      throw new BadRequestException('续读位置无效');
    try {
      return await this.prisma.$transaction(async (db) => {
        await this.reader.requireReadyBook(ownerId, bookId, db);
        const section = await this.reader.requireSection(
          ownerId,
          bookId,
          input.sectionId,
          db,
        );
        if (input.offset > section.content.length)
          throw new BadRequestException('续读位置超出章节范围');
        if (input.contentHash !== this.reader.contentHash(section.content))
          throw new ConflictException({
            code: 'READER_CONTENT_CHANGED',
            message: '正文已更新，请重新加载章节后保存位置',
          });
        const data = {
          sectionId: input.sectionId,
          offset: this.reader.safeBoundary(section.content, input.offset),
          contentHash: input.contentHash,
        };
        if (input.expectedRevision === 0) {
          return this.toPosition(
            await db.bookReadingPosition.create({
              data: { ownerId, bookId, ...data, revision: 1 },
            }),
          );
        }
        const updated = await db.bookReadingPosition.updateMany({
          where: { ownerId, bookId, revision: input.expectedRevision },
          data: { ...data, revision: { increment: 1 } },
        });
        if (updated.count !== 1) throw this.conflict();
        const row = await db.bookReadingPosition.findUniqueOrThrow({
          where: { ownerId_bookId: { ownerId, bookId } },
        });
        return this.toPosition(row);
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      )
        throw this.conflict();
      throw error;
    }
  }

  private conflict() {
    return new ConflictException({
      code: 'READER_POSITION_CONFLICT',
      message: '其他窗口已更新续读位置，请选择是否使用本窗口的位置',
    });
  }
  private toPosition(
    row: {
      bookId: string;
      sectionId: string;
      offset: number;
      contentHash: string;
      revision: number;
      updatedAt: Date;
    },
    contentChanged = false,
  ): ReaderPosition {
    return {
      bookId: row.bookId,
      sectionId: row.sectionId,
      offset: row.offset,
      contentHash: row.contentHash,
      revision: row.revision,
      updatedAt: row.updatedAt.toISOString(),
      contentChanged,
    };
  }
}
