import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Book,
  BookAssistant,
  BookStatus,
  BookVisibility,
  IngestionJobStatus,
  Prisma,
  ReadingProgress,
} from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { BookFileStorageService } from './book-file-storage.service';
import type { BookView, UploadedBookFile } from './books.types';

type BookWithPersonalization = Book & {
  assistants: Pick<BookAssistant, 'id' | 'name' | 'responseDepth' | 'tone'>[];
  readingProgress: Pick<ReadingProgress, 'mode' | 'currentSectionOrder'>[];
};

interface ValidatedUpload {
  extension: 'epub' | 'txt';
  canonicalMimeType: 'application/epub+zip' | 'text/plain';
  originalFileName: string;
  title: string;
  size: number;
  contentHash: string;
}

@Injectable()
export class BooksService {
  private readonly logger = new Logger(BooksService.name);
  private readonly maxUploadBytes: number;
  private readonly parserVersion: string;
  private readonly embeddingVersion: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: BookFileStorageService,
    configService: ConfigService,
  ) {
    this.maxUploadBytes =
      configService.get<number>('books.maxUploadBytes') || 50 * 1024 * 1024;
    this.parserVersion =
      configService.get<string>('books.parserVersion') || 'book-parser-v1';
    this.embeddingVersion =
      configService.get<string>('books.embeddingVersion') ||
      'book-embedding-v1';
  }

  async createFromUpload(
    ownerId: string,
    file: UploadedBookFile | undefined,
  ): Promise<BookView> {
    const upload = this.validateUpload(file);
    const duplicate = await this.prisma.book.findFirst({
      where: {
        ownerId,
        contentHash: upload.contentHash,
        status: { not: BookStatus.DELETING },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw this.duplicateBookException(duplicate.id);
    }

    const bookId = randomUUID();
    const storageKey = await this.storage.save(
      ownerId,
      bookId,
      upload.extension,
      file!.buffer,
    );

    try {
      const book = await this.prisma.book.create({
        data: {
          id: bookId,
          ownerId,
          visibility: BookVisibility.PRIVATE,
          title: upload.title,
          originalFileName: upload.originalFileName,
          storageKey,
          mimeType: upload.canonicalMimeType,
          fileSizeBytes: BigInt(upload.size),
          contentHash: upload.contentHash,
          status: BookStatus.QUEUED,
          statusProgress: 0,
          parserVersion: this.parserVersion,
          embeddingVersion: this.embeddingVersion,
          ingestionJob: {
            create: {},
          },
        },
      });
      return this.toBookView({
        ...book,
        assistants: [],
        readingProgress: [],
      });
    } catch (error) {
      await this.storage.deleteByKey(storageKey).catch((cleanupError) => {
        this.logger.error(
          `Failed to clean up source for uncommitted book ${bookId}: ${String(cleanupError)}`,
        );
      });
      if (this.isUniqueConstraintError(error)) {
        const existing = await this.prisma.book.findFirst({
          where: { ownerId, contentHash: upload.contentHash },
          select: { id: true },
        });
        throw this.duplicateBookException(existing?.id);
      }
      throw error;
    }
  }

  async list(ownerId: string): Promise<BookView[]> {
    const books = await this.prisma.book.findMany({
      where: {
        AND: [
          this.accessibleWhere(ownerId),
          { status: { not: BookStatus.DELETING } },
        ],
      },
      include: this.personalizationInclude(ownerId),
      orderBy: { updatedAt: 'desc' },
    });
    return books.map((book) => this.toBookView(book));
  }

  async getById(ownerId: string, bookId: string): Promise<BookView> {
    const book = await this.findAccessible(ownerId, bookId);
    if (!book) throw new NotFoundException('书籍不存在');
    return this.toBookView(book);
  }

  async delete(ownerId: string, bookId: string): Promise<void> {
    const book = await this.findAccessible(ownerId, bookId);
    if (!book) throw new NotFoundException('书籍不存在');
    if (book.visibility === BookVisibility.SYSTEM) {
      throw new ForbiddenException('系统示例书不能删除');
    }

    if (book.status === BookStatus.DELETING) {
      await this.prisma.ingestionJob.updateMany({
        where: {
          bookId: book.id,
          status: IngestionJobStatus.FAILED,
        },
        data: {
          status: IngestionJobStatus.QUEUED,
          lockedAt: null,
          heartbeatAt: null,
          lastError: null,
        },
      });
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      const deleting = await tx.book.updateMany({
        where: {
          id: book.id,
          ownerId,
          status: { not: BookStatus.DELETING },
        },
        data: {
          status: BookStatus.DELETING,
          failureCode: null,
          failureMessage: null,
        },
      });
      if (deleting.count === 0) return;
      await tx.ingestionJob.upsert({
        where: { bookId: book.id },
        create: { bookId: book.id, status: IngestionJobStatus.QUEUED },
        update: {
          status: IngestionJobStatus.QUEUED,
          lockedAt: null,
          heartbeatAt: null,
          lastError: null,
        },
      });
    });
  }

  async retry(ownerId: string, bookId: string): Promise<BookView> {
    const book = await this.findAccessible(ownerId, bookId);
    if (!book) throw new NotFoundException('书籍不存在');
    if (book.visibility === BookVisibility.SYSTEM) {
      throw new ForbiddenException('系统示例书不能重新处理');
    }
    if (book.status !== BookStatus.FAILED) {
      throw new ConflictException('只有处理失败的书籍可以重试');
    }

    await this.prisma.$transaction(async (tx) => {
      const reset = await tx.book.updateMany({
        where: {
          id: book.id,
          ownerId,
          status: BookStatus.FAILED,
        },
        data: {
          status: BookStatus.QUEUED,
          statusProgress: 0,
          failureCode: null,
          failureMessage: null,
        },
      });
      if (reset.count === 0) {
        throw new ConflictException('书籍状态已变化，请刷新后重试');
      }
      await tx.ingestionJob.upsert({
        where: { bookId: book.id },
        create: { bookId: book.id },
        update: {
          status: IngestionJobStatus.QUEUED,
          lockedAt: null,
          heartbeatAt: null,
          lastError: null,
        },
      });
    });
    return this.getById(ownerId, bookId);
  }

  private findAccessible(
    ownerId: string,
    bookId: string,
  ): Promise<BookWithPersonalization | null> {
    return this.prisma.book.findFirst({
      where: {
        id: bookId,
        ...this.accessibleWhere(ownerId),
      },
      include: this.personalizationInclude(ownerId),
    });
  }

  private accessibleWhere(ownerId: string): Prisma.BookWhereInput {
    return {
      OR: [
        { ownerId, visibility: BookVisibility.PRIVATE },
        { visibility: BookVisibility.SYSTEM },
      ],
    };
  }

  private personalizationInclude(ownerId: string) {
    return {
      assistants: {
        where: { ownerId },
        select: {
          id: true,
          name: true,
          responseDepth: true,
          tone: true,
        },
        take: 1,
      },
      readingProgress: {
        where: { ownerId },
        select: {
          mode: true,
          currentSectionOrder: true,
        },
        take: 1,
      },
    } as const;
  }

  private validateUpload(file: UploadedBookFile | undefined): ValidatedUpload {
    if (!file?.buffer || !Buffer.isBuffer(file.buffer)) {
      throw new BadRequestException('请选择要上传的小说文件');
    }
    const size = file.buffer.length;
    if (size === 0) {
      throw new BadRequestException('上传文件不能为空');
    }
    if (size > this.maxUploadBytes) {
      throw new BadRequestException({
        message: `文件不能超过 ${Math.floor(this.maxUploadBytes / 1024 / 1024)} MB`,
        code: 'FILE_TOO_LARGE',
      });
    }

    const originalFileName = this.safeDisplayFileName(file.originalname);
    const rawExtension = path.extname(originalFileName).toLowerCase();
    if (rawExtension !== '.epub' && rawExtension !== '.txt') {
      throw new BadRequestException({
        message: '目前只支持 EPUB 和 TXT 文件',
        code: 'UNSUPPORTED_FORMAT',
      });
    }

    const extension = rawExtension.slice(1) as 'epub' | 'txt';
    if (extension === 'epub' && !this.hasZipSignature(file.buffer)) {
      throw new BadRequestException({
        message: 'EPUB 文件格式无效',
        code: 'INVALID_EPUB',
      });
    }
    if (extension === 'txt' && this.looksBinary(file.buffer)) {
      throw new BadRequestException({
        message: 'TXT 文件包含无法识别的二进制内容',
        code: 'UNSUPPORTED_FORMAT',
      });
    }

    const baseName = path.basename(
      originalFileName,
      path.extname(originalFileName),
    );
    const title =
      this.stripControlCharacters(baseName).trim().slice(0, 200) ||
      '未命名小说';

    return {
      extension,
      canonicalMimeType:
        extension === 'epub' ? 'application/epub+zip' : 'text/plain',
      originalFileName,
      title,
      size,
      contentHash: createHash('sha256').update(file.buffer).digest('hex'),
    };
  }

  private safeDisplayFileName(value: string): string {
    const decodedValue = this.decodeMultipartFileName(value);
    const normalized = this.stripControlCharacters(
      path.basename(decodedValue || '未命名小说'),
    ).trim();
    return (normalized || '未命名小说').slice(0, 255);
  }

  private decodeMultipartFileName(value: string): string {
    if (!/[\u0080-\u00ff]/.test(value)) return value;
    const decoded = Buffer.from(value, 'latin1').toString('utf8');
    return decoded.includes('\uFFFD') ? value : decoded;
  }

  private stripControlCharacters(value: string): string {
    return value
      .split('')
      .filter((character) => {
        const code = character.charCodeAt(0);
        return code >= 32 && code !== 127;
      })
      .join('');
  }

  private hasZipSignature(buffer: Buffer): boolean {
    return (
      buffer.length >= 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      ((buffer[2] === 0x03 && buffer[3] === 0x04) ||
        (buffer[2] === 0x05 && buffer[3] === 0x06) ||
        (buffer[2] === 0x07 && buffer[3] === 0x08))
    );
  }

  private looksBinary(buffer: Buffer): boolean {
    return buffer.subarray(0, 8192).includes(0);
  }

  private duplicateBookException(bookId?: string): ConflictException {
    return new ConflictException({
      message: '这本书已经在你的书架中',
      code: 'DUPLICATE_BOOK',
      ...(bookId ? { bookId } : {}),
    });
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private toBookView(book: BookWithPersonalization): BookView {
    const assistant = book.assistants[0] ?? null;
    const readingProgress = book.readingProgress[0] ?? null;
    return {
      id: book.id,
      title: book.title,
      author: book.author,
      visibility: book.visibility,
      status: book.status,
      statusProgress: book.statusProgress,
      failureCode: book.failureCode,
      failureMessage: book.failureMessage,
      originalFileName: book.originalFileName,
      mimeType: book.mimeType,
      fileSizeBytes: Number(book.fileSizeBytes),
      sectionCount: book.sectionCount,
      chunkCount: book.chunkCount,
      readyAt: book.readyAt,
      createdAt: book.createdAt,
      updatedAt: book.updatedAt,
      assistant,
      readingProgress,
    };
  }
}
