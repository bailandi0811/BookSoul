import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { requireSafePathSegment } from '../../auth/auth-context';
import { PrismaService } from '../../prisma/prisma.service';
import { MemoryEntry, MemoryLevel } from '../interfaces/memory.types';

@Injectable()
export class MemoryEntryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getById(memoryId: string, userId: string): Promise<MemoryEntry | null> {
    this.validateIdentity(userId, memoryId);
    const record = await this.prisma.memoryRecord.findFirst({
      where: { id: memoryId, ownerId: userId },
    });
    return record ? this.toEntry(record) : null;
  }

  async getByUserId(
    userId: string,
    sessionId?: string,
  ): Promise<MemoryEntry[]> {
    requireSafePathSegment(userId, '用户标识');
    if (sessionId) requireSafePathSegment(sessionId, '会话标识');

    const records = await this.prisma.memoryRecord.findMany({
      where: {
        ownerId: userId,
        ...(sessionId ? { sessionId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((record) => this.toEntry(record));
  }

  async getByLevel(
    userId: string,
    level: MemoryLevel,
    sessionId?: string,
  ): Promise<MemoryEntry[]> {
    requireSafePathSegment(userId, '用户标识');
    if (sessionId) requireSafePathSegment(sessionId, '会话标识');

    const records = await this.prisma.memoryRecord.findMany({
      where: {
        ownerId: userId,
        level,
        ...(sessionId ? { sessionId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((record) => this.toEntry(record));
  }

  async getForBookContext(
    userId: string,
    bookId: string,
  ): Promise<MemoryEntry[]> {
    requireSafePathSegment(userId, '用户标识');
    requireSafePathSegment(bookId, '书籍标识');

    const records = await this.prisma.memoryRecord.findMany({
      where: {
        ownerId: userId,
        OR: [{ bookId: null }, { bookId }],
      },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((record) => this.toEntry(record));
  }

  async save(entry: MemoryEntry): Promise<void> {
    this.validateIdentity(entry.userId, entry.id);
    requireSafePathSegment(entry.sessionId, '会话标识');

    const existing = await this.prisma.memoryRecord.findUnique({
      where: { id: entry.id },
      select: { ownerId: true },
    });
    if (existing && existing.ownerId !== entry.userId) {
      throw new ConflictException('记忆标识已归属其他用户');
    }

    const data = this.toPersistence(entry);
    await this.prisma.memoryRecord.upsert({
      where: { id: entry.id },
      create: data,
      update: {
        level: data.level,
        content: data.content,
        importance: data.importance,
        category: data.category,
        metadata: data.metadata,
        updatedAt: data.updatedAt,
      },
    });
  }

  async delete(memoryId: string, userId: string): Promise<void> {
    this.validateIdentity(userId, memoryId);
    await this.prisma.memoryRecord.deleteMany({
      where: { id: memoryId, ownerId: userId },
    });
  }

  async update(
    memoryId: string,
    userId: string,
    updates: Partial<MemoryEntry>,
  ): Promise<MemoryEntry | null> {
    const existing = await this.getById(memoryId, userId);
    if (!existing) return null;

    const updated: MemoryEntry = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      sessionId: existing.sessionId,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await this.save(updated);
    return updated;
  }

  generateId(): string {
    return `mem_${randomUUID()}`;
  }

  private validateIdentity(userId: string, memoryId: string): void {
    requireSafePathSegment(userId, '用户标识');
    requireSafePathSegment(memoryId, '记忆标识');
  }

  private toPersistence(
    entry: MemoryEntry,
  ): Prisma.MemoryRecordUncheckedCreateInput {
    return {
      id: entry.id,
      ownerId: entry.userId,
      sessionId: entry.sessionId,
      bookId: entry.bookId ?? null,
      level: entry.level,
      content: entry.content,
      importance: entry.importance,
      category: entry.category,
      metadata: JSON.parse(
        JSON.stringify(entry.metadata),
      ) as Prisma.InputJsonValue,
      createdAt: new Date(entry.createdAt),
      updatedAt: new Date(entry.updatedAt),
    };
  }

  private toEntry(record: {
    id: string;
    ownerId: string;
    sessionId: string;
    bookId: string | null;
    level: string;
    content: string;
    importance: number;
    category: string;
    metadata: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }): MemoryEntry {
    return {
      id: record.id,
      userId: record.ownerId,
      sessionId: record.sessionId,
      bookId: record.bookId,
      level: record.level as MemoryEntry['level'],
      content: record.content,
      importance: record.importance,
      category: record.category as MemoryEntry['category'],
      metadata: record.metadata as unknown as MemoryEntry['metadata'],
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
