import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookStatus, BookVisibility, ReadingMode } from '@prisma/client';
import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { defaultBookAssistantName } from './book-assistant.policy';
import { BookFileStorageService } from './book-file-storage.service';

export const TIANLONG_SYSTEM_BOOK_ID = '31d0947f-3b1f-4f43-b98f-12dfbd1d4f58';

@Injectable()
export class SystemBookMigrationService {
  private readonly parserVersion: string;
  private readonly embeddingVersion: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: BookFileStorageService,
    configService: ConfigService,
  ) {
    this.parserVersion =
      configService.get<string>('books.parserVersion') || 'book-parser-v1';
    this.embeddingVersion =
      configService.get<string>('books.embeddingVersion') ||
      'book-embedding-v1';
  }

  async seedTianlong(filePath: string) {
    const absolutePath = path.resolve(filePath);
    const extension = path.extname(absolutePath).toLowerCase();
    if (extension !== '.epub' && extension !== '.txt') {
      throw new Error('系统示例书只支持 EPUB 或 TXT');
    }
    const content = await readFile(absolutePath);
    if (content.length === 0) throw new Error('系统示例书文件不能为空');
    if (
      extension === '.epub' &&
      !(
        content[0] === 0x50 &&
        content[1] === 0x4b &&
        ((content[2] === 0x03 && content[3] === 0x04) ||
          (content[2] === 0x05 && content[3] === 0x06) ||
          (content[2] === 0x07 && content[3] === 0x08))
      )
    ) {
      throw new Error('系统示例 EPUB 文件格式无效');
    }

    const contentHash = createHash('sha256').update(content).digest('hex');
    const existing = await this.prisma.book.findUnique({
      where: { id: TIANLONG_SYSTEM_BOOK_ID },
      select: {
        id: true,
        visibility: true,
        contentHash: true,
        status: true,
      },
    });
    if (existing) {
      if (existing.visibility !== BookVisibility.SYSTEM) {
        throw new Error('稳定系统书 ID 已被非系统书占用');
      }
      if (existing.contentHash !== contentHash) {
        throw new Error('系统示例书内容已变化，请使用显式重新索引流程');
      }
      return { ...existing, created: false };
    }

    const storageKey = await this.storage.saveSystem(
      TIANLONG_SYSTEM_BOOK_ID,
      extension.slice(1) as 'epub' | 'txt',
      content,
    );
    try {
      const book = await this.prisma.book.create({
        data: {
          id: TIANLONG_SYSTEM_BOOK_ID,
          ownerId: null,
          visibility: BookVisibility.SYSTEM,
          title: '天龙八部',
          author: '金庸',
          originalFileName: path.basename(absolutePath),
          storageKey,
          mimeType:
            extension === '.epub' ? 'application/epub+zip' : 'text/plain',
          fileSizeBytes: BigInt(content.length),
          contentHash,
          status: BookStatus.QUEUED,
          statusProgress: 0,
          parserVersion: this.parserVersion,
          embeddingVersion: this.embeddingVersion,
          ingestionJob: { create: {} },
        },
        select: {
          id: true,
          visibility: true,
          contentHash: true,
          status: true,
        },
      });
      return { ...book, created: true };
    } catch (error) {
      await this.storage.deleteByKey(storageKey).catch(() => undefined);
      throw error;
    }
  }

  async backfillLegacyTianlongSessions() {
    const systemBook = await this.prisma.book.findUnique({
      where: { id: TIANLONG_SYSTEM_BOOK_ID },
      select: { id: true, title: true, status: true },
    });
    if (!systemBook || systemBook.status !== BookStatus.READY) {
      throw new Error('系统示例书 READY 后才能回填旧会话');
    }

    const legacySessions = await this.prisma.chatSessionRecord.findMany({
      where: { bookAssistantId: null },
      select: { ownerId: true, sessionId: true },
    });
    const ownerIds = [...new Set(legacySessions.map((item) => item.ownerId))];
    const registeredUsers = await this.prisma.user.findMany({
      where: { id: { in: ownerIds } },
      select: { id: true },
    });
    const registeredOwnerIds = new Set(registeredUsers.map((user) => user.id));
    let sessionsUpdated = 0;
    let memoriesUpdated = 0;

    for (const ownerId of registeredOwnerIds) {
      const sessionIds = legacySessions
        .filter((session) => session.ownerId === ownerId)
        .map((session) => session.sessionId);
      const result = await this.prisma.$transaction(async (tx) => {
        const assistant = await tx.bookAssistant.upsert({
          where: {
            ownerId_bookId: { ownerId, bookId: TIANLONG_SYSTEM_BOOK_ID },
          },
          create: {
            ownerId,
            bookId: TIANLONG_SYSTEM_BOOK_ID,
            name: defaultBookAssistantName(systemBook.title),
          },
          update: {},
          select: { id: true },
        });
        await tx.readingProgress.upsert({
          where: {
            ownerId_bookId: { ownerId, bookId: TIANLONG_SYSTEM_BOOK_ID },
          },
          create: {
            ownerId,
            bookId: TIANLONG_SYSTEM_BOOK_ID,
            mode: ReadingMode.NOT_STARTED,
          },
          update: {},
        });
        const sessions = await tx.chatSessionRecord.updateMany({
          where: {
            ownerId,
            sessionId: { in: sessionIds },
            bookAssistantId: null,
          },
          data: { bookAssistantId: assistant.id },
        });
        const memories = await tx.memoryRecord.updateMany({
          where: {
            ownerId,
            sessionId: { in: sessionIds },
            bookId: null,
            category: 'other',
          },
          data: { bookId: TIANLONG_SYSTEM_BOOK_ID },
        });
        return { sessions: sessions.count, memories: memories.count };
      });
      sessionsUpdated += result.sessions;
      memoriesUpdated += result.memories;
    }

    return {
      sessionsUpdated,
      memoriesUpdated,
      skippedUnregisteredSessions: legacySessions.filter(
        (session) => !registeredOwnerIds.has(session.ownerId),
      ).length,
    };
  }
}
