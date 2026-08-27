import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { MemoryEntry, MemoryLevel } from '../interfaces/memory.types';
import { requireSafePathSegment, resolveWithinRoot } from '../../auth/auth-context';

@Injectable()
export class MemoryEntryRepository {
  private readonly logger = new Logger(MemoryEntryRepository.name);
  private readonly baseDir = 'memories/long_term';

  async getById(memoryId: string, userId: string): Promise<MemoryEntry | null> {
    try {
      const filePath = this.getFilePath(userId, memoryId);
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data) as MemoryEntry;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      this.logger.error('Failed to load memory entry');
      throw error;
    }
  }

  async getByUserId(userId: string, sessionId?: string): Promise<MemoryEntry[]> {
    try {
      const dir = this.getUserDirectory(userId);
      await fs.mkdir(dir, { recursive: true });
      const files = await fs.readdir(dir);
      const entries: MemoryEntry[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const data = await fs.readFile(path.join(dir, file), 'utf-8');
          const entry = JSON.parse(data) as MemoryEntry;
          if (entry.userId !== userId) continue;
          if (sessionId && entry.sessionId !== sessionId) continue;
          entries.push(entry);
        } catch (e) {
          this.logger.warn(`Failed to parse memory file ${file}: ${e}`);
        }
      }

      return entries.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch {
      this.logger.error('Failed to load memory entries');
      return [];
    }
  }

  async getByLevel(userId: string, level: MemoryLevel, sessionId?: string): Promise<MemoryEntry[]> {
    const all = await this.getByUserId(userId, sessionId);
    return all.filter(e => e.level === level);
  }

  async save(entry: MemoryEntry): Promise<void> {
    try {
      const dir = this.getUserDirectory(entry.userId);
      await fs.mkdir(dir, { recursive: true });
      const filePath = this.getFilePath(entry.userId, entry.id);
      const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(temporaryPath, JSON.stringify(entry, null, 2));
      await fs.rename(temporaryPath, filePath);
    } catch (error) {
      this.logger.error('Failed to save memory entry');
      throw error;
    }
  }

  async delete(memoryId: string, userId: string): Promise<void> {
    try {
      const filePath = this.getFilePath(userId, memoryId);
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async update(memoryId: string, userId: string, updates: Partial<MemoryEntry>): Promise<MemoryEntry | null> {
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
    return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getFilePath(userId: string, memoryId: string): string {
    requireSafePathSegment(memoryId, '记忆标识');
    return resolveWithinRoot(
      this.getUserDirectory(userId),
      `${memoryId}.json`,
    );
  }

  private getUserDirectory(userId: string): string {
    requireSafePathSegment(userId, '用户标识');
    return resolveWithinRoot(path.join(process.cwd(), this.baseDir), userId);
  }
}
