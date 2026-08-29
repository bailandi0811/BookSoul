import { Injectable, NotFoundException } from '@nestjs/common';
import { BookStatus, BookVisibility, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { requireSafePathSegment } from '../auth/auth-context';
import { BookAssistantsService } from '../books/book-assistants.service';
import { BookReadingService } from '../books/book-reading.service';
import { PrismaService } from '../prisma/prisma.service';

interface StoredHistoryMessage {
  type: 'human' | 'ai';
  data: { content: string };
}

export interface BookChatContext {
  ownerId: string;
  sessionId: string;
  assistantId: string;
  bookId: string;
  bookTitle: string;
  assistantName: string;
  responseDepth: 'BRIEF' | 'BALANCED' | 'DEEP';
  tone: 'NATURAL' | 'WARM' | 'ANALYTICAL';
  customInstruction: string | null;
  boundary: {
    ownerScope: string;
    bookId: string;
    embeddingVersion: string;
    spoilerCeiling: number;
  };
}

@Injectable()
export class BookSessionsService {
  private readonly historyLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly assistants: BookAssistantsService,
    private readonly reading: BookReadingService,
  ) {}

  async create(ownerId: string, bookId: string) {
    const assistant = await this.assistants.get(ownerId, bookId);
    return this.prisma.chatSessionRecord.create({
      data: {
        ownerId,
        sessionId: randomUUID(),
        bookAssistantId: assistant.id,
        title: '新对话',
        messages: [] as Prisma.InputJsonValue,
      },
      select: {
        sessionId: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async list(ownerId: string, bookId: string) {
    const assistant = await this.assistants.get(ownerId, bookId);
    return this.prisma.chatSessionRecord.findMany({
      where: { ownerId, bookAssistantId: assistant.id },
      orderBy: { updatedAt: 'desc' },
      select: {
        sessionId: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async listAll(ownerId: string) {
    requireSafePathSegment(ownerId, '用户标识');
    return this.prisma.chatSessionRecord.findMany({
      where: { ownerId, bookAssistantId: { not: null } },
      orderBy: { updatedAt: 'desc' },
      select: {
        sessionId: true,
        title: true,
        updatedAt: true,
      },
    });
  }

  async resolve(
    ownerId: string,
    sessionId: string,
    spoilerOverride = false,
  ): Promise<BookChatContext> {
    this.validateScope(ownerId, sessionId);
    const session = await this.prisma.chatSessionRecord.findUnique({
      where: { ownerId_sessionId: { ownerId, sessionId } },
      include: {
        bookAssistant: {
          include: { book: true },
        },
      },
    });
    const assistant = session?.bookAssistant;
    const book = assistant?.book;
    if (
      !session ||
      !assistant ||
      !book ||
      assistant.ownerId !== ownerId ||
      book.status !== BookStatus.READY ||
      !(
        (book.visibility === BookVisibility.PRIVATE &&
          book.ownerId === ownerId) ||
        book.visibility === BookVisibility.SYSTEM
      )
    ) {
      throw new NotFoundException('会话不存在或当前不可用');
    }
    const boundary = await this.reading.getRetrievalBoundary(
      ownerId,
      book.id,
      spoilerOverride,
    );
    return {
      ownerId,
      sessionId,
      assistantId: assistant.id,
      bookId: book.id,
      bookTitle: book.title,
      assistantName: assistant.name,
      responseDepth: assistant.responseDepth,
      tone: assistant.tone,
      customInstruction: assistant.customInstruction,
      boundary,
    };
  }

  async getHistory(ownerId: string, sessionId: string) {
    await this.resolve(ownerId, sessionId);
    const record = await this.prisma.chatSessionRecord.findUnique({
      where: { ownerId_sessionId: { ownerId, sessionId } },
      select: { messages: true },
    });
    return this.asStoredMessages(record?.messages).map((message) => ({
      role:
        message.type === 'human' ? ('user' as const) : ('assistant' as const),
      content: message.data.content,
    }));
  }

  async getRecentMessages(ownerId: string, sessionId: string) {
    const record = await this.prisma.chatSessionRecord.findUnique({
      where: { ownerId_sessionId: { ownerId, sessionId } },
      select: { messages: true },
    });
    if (!record) throw new NotFoundException('会话不存在或当前不可用');
    return this.asStoredMessages(record.messages)
      .slice(-8)
      .map((message) => ({
        role:
          message.type === 'human' ? ('user' as const) : ('assistant' as const),
        content: message.data.content,
      }));
  }

  async appendExchange(
    context: BookChatContext,
    query: string,
    response: string,
  ): Promise<void> {
    const lockKey = `${context.ownerId}:${context.sessionId}`;
    await this.withHistoryLock(lockKey, async () => {
      const record = await this.prisma.chatSessionRecord.findUnique({
        where: {
          ownerId_sessionId: {
            ownerId: context.ownerId,
            sessionId: context.sessionId,
          },
        },
        select: { messages: true, title: true },
      });
      if (!record) throw new NotFoundException('会话不存在或当前不可用');
      const messages = [
        ...this.asStoredMessages(record.messages),
        { type: 'human' as const, data: { content: query } },
        { type: 'ai' as const, data: { content: response } },
      ] as unknown as Prisma.InputJsonValue;
      const title =
        !record.title || record.title === '新对话'
          ? this.titleFromQuery(query)
          : record.title;
      const updated = await this.prisma.chatSessionRecord.updateMany({
        where: {
          ownerId: context.ownerId,
          sessionId: context.sessionId,
          bookAssistantId: context.assistantId,
        },
        data: { messages, title },
      });
      if (updated.count === 0) {
        throw new NotFoundException('会话不存在或当前不可用');
      }
    });
  }

  async delete(ownerId: string, sessionId: string): Promise<void> {
    await this.resolve(ownerId, sessionId);
    await this.prisma.chatSessionRecord.deleteMany({
      where: { ownerId, sessionId },
    });
  }

  private asStoredMessages(
    value: Prisma.JsonValue | undefined,
  ): StoredHistoryMessage[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item))
        return false;
      const message = item as unknown as Partial<StoredHistoryMessage>;
      return (
        (message.type === 'human' || message.type === 'ai') &&
        typeof message.data?.content === 'string'
      );
    }) as unknown as StoredHistoryMessage[];
  }

  private titleFromQuery(query: string): string {
    const normalized = query.replace(/\s+/g, ' ').trim();
    return normalized.slice(0, 40) || '新对话';
  }

  private validateScope(ownerId: string, sessionId: string): void {
    requireSafePathSegment(ownerId, '用户标识');
    requireSafePathSegment(sessionId, '会话标识');
  }

  private async withHistoryLock<T>(
    lockKey: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.historyLocks.get(lockKey) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => gate);
    this.historyLocks.set(lockKey, queued);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.historyLocks.get(lockKey) === queued) {
        this.historyLocks.delete(lockKey);
      }
    }
  }
}
