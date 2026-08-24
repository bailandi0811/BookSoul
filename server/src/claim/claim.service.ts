import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  requireGuestUserId,
  requireSafePathSegment,
  resolveWithinRoot,
} from '../auth/auth-context';
import { MilvusService } from '../milvus/milvus.service';
import type { MemoryEntry, UserProfile } from '../memory/interfaces/memory.types';

export type ClaimStatus = 'completed' | 'partial' | 'already_claimed';

export interface ClaimGuestResult {
  status: ClaimStatus;
  history: 'claimed' | 'already_claimed';
  memory: 'claimed' | 'already_claimed' | 'none';
  vectors: 'claimed' | 'already_claimed' | 'unavailable';
}

@Injectable()
export class ClaimService {
  private readonly logger = new Logger(ClaimService.name);

  constructor(private readonly milvusService: MilvusService) {}

  async claimGuest(
    guestUserId: string,
    sessionId: string,
    userId: string,
  ): Promise<ClaimGuestResult> {
    requireGuestUserId(guestUserId);
    requireSafePathSegment(sessionId, '会话标识');
    requireSafePathSegment(userId, '用户标识');

    const history = await this.claimHistory(guestUserId, sessionId, userId);
    const memory = await this.claimMemoryFiles(
      guestUserId,
      sessionId,
      userId,
    );
    const vectors = await this.claimVectors(guestUserId, sessionId, userId);

    if (vectors === 'unavailable') {
      return { status: 'partial', history, memory, vectors };
    }
    const already =
      history === 'already_claimed' &&
      (memory === 'already_claimed' || memory === 'none') &&
      vectors === 'already_claimed';
    return {
      status: already ? 'already_claimed' : 'completed',
      history,
      memory,
      vectors,
    };
  }

  private async claimHistory(
    guestUserId: string,
    sessionId: string,
    userId: string,
  ): Promise<'claimed' | 'already_claimed'> {
    const filePath = resolveWithinRoot(
      path.join(process.cwd(), 'chat_histories'),
      `session_${sessionId}.json`,
    );
    let data: Record<string, Record<string, { userId?: string }>>;
    try {
      data = JSON.parse(await fs.readFile(filePath, 'utf8')) as typeof data;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException('访客会话不存在');
      }
      throw error;
    }
    const session = data['']?.[sessionId];
    if (!session) throw new NotFoundException('访客会话不存在');
    if (session.userId === userId) return 'already_claimed';
    const isCompatibleUnownedHistory =
      guestUserId === 'anonymous' && session.userId === undefined;
    if (session.userId !== guestUserId && !isCompatibleUnownedHistory) {
      throw new ConflictException('会话已归属其他身份');
    }
    session.userId = userId;
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    return 'claimed';
  }

  private async claimMemoryFiles(
    guestUserId: string,
    sessionId: string,
    userId: string,
  ): Promise<'claimed' | 'already_claimed' | 'none'> {
    let claimed = false;
    let alreadyClaimed = false;
    const profileRoot = path.join(process.cwd(), 'memories', 'profiles');
    const sourceProfile = resolveWithinRoot(
      profileRoot,
      guestUserId,
      `${sessionId}.json`,
    );
    const targetProfile = resolveWithinRoot(
      profileRoot,
      userId,
      `${sessionId}.json`,
    );

    const sourceProfileData = await this.readJson<UserProfile>(sourceProfile);
    const targetProfileData = await this.readJson<UserProfile>(targetProfile);
    if (sourceProfileData) {
      const merged: UserProfile = targetProfileData
        ? {
            ...sourceProfileData,
            ...targetProfileData,
            userId,
            sessionId,
            facts: { ...sourceProfileData.facts, ...targetProfileData.facts },
            preferences: {
              favoriteCharacters: [
                ...new Set([
                  ...sourceProfileData.preferences.favoriteCharacters,
                  ...targetProfileData.preferences.favoriteCharacters,
                ]),
              ],
              interests: [
                ...new Set([
                  ...sourceProfileData.preferences.interests,
                  ...targetProfileData.preferences.interests,
                ]),
              ],
              location:
                targetProfileData.preferences.location ??
                sourceProfileData.preferences.location,
            },
            updatedAt: new Date().toISOString(),
          }
        : { ...sourceProfileData, userId, updatedAt: new Date().toISOString() };
      await this.writeJson(targetProfile, merged);
      await fs.unlink(sourceProfile);
      claimed = true;
    } else if (targetProfileData) {
      alreadyClaimed = true;
    }

    const memoryRoot = path.join(process.cwd(), 'memories', 'long_term');
    const sourceDirectory = resolveWithinRoot(memoryRoot, guestUserId);
    const targetDirectory = resolveWithinRoot(memoryRoot, userId);
    let sourceFiles: string[] = [];
    try {
      sourceFiles = await fs.readdir(sourceDirectory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    for (const filename of sourceFiles.filter((file) => file.endsWith('.json'))) {
      const sourcePath = resolveWithinRoot(sourceDirectory, filename);
      const entry = await this.readJson<MemoryEntry>(sourcePath);
      if (!entry || entry.sessionId !== sessionId) continue;
      const targetPath = resolveWithinRoot(targetDirectory, filename);
      const existing = await this.readJson<MemoryEntry>(targetPath);
      if (existing) {
        if (existing.userId !== userId || existing.sessionId !== sessionId) {
          throw new ConflictException('目标记忆已存在且归属冲突');
        }
        await fs.unlink(sourcePath);
        alreadyClaimed = true;
      } else {
        await this.writeJson(targetPath, {
          ...entry,
          userId,
          updatedAt: new Date().toISOString(),
        });
        await fs.unlink(sourcePath);
        claimed = true;
      }
    }

    if (claimed) return 'claimed';
    if (alreadyClaimed) return 'already_claimed';
    return 'none';
  }

  private async claimVectors(
    guestUserId: string,
    sessionId: string,
    userId: string,
  ): Promise<'claimed' | 'already_claimed' | 'unavailable'> {
    try {
      const client = this.milvusService.getClient();
      const source = await client.query({
        collection_name: 'memory_embeddings',
        filter: `user_id == "${guestUserId}" && session_id == "${sessionId}"`,
        output_fields: ['*'],
      });
      if (!source.data.length) {
        const target = await client.query({
          collection_name: 'memory_embeddings',
          filter: `user_id == "${userId}" && session_id == "${sessionId}"`,
          output_fields: ['id'],
          limit: 1,
        });
        return target.data.length ? 'already_claimed' : 'already_claimed';
      }
      await client.upsert({
        collection_name: 'memory_embeddings',
        data: source.data.map((record) => ({ ...record, user_id: userId })),
      });
      await client.delete({
        collection_name: 'memory_embeddings',
        filter: `user_id == "${guestUserId}" && session_id == "${sessionId}"`,
      });
      return 'claimed';
    } catch (error) {
      this.logger.warn('Guest vector claim is incomplete; retry is safe');
      return 'unavailable';
    }
  }

  private async readJson<T>(filePath: string): Promise<T | null> {
    try {
      return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  private async writeJson(filePath: string, value: unknown): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(value, null, 2));
  }
}
