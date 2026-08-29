import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  requireGuestUserId,
  requireSafePathSegment,
} from '../auth/auth-context';
import { MilvusService } from '../milvus/milvus.service';
import { PrismaService } from '../prisma/prisma.service';
import type { UserProfile } from '../memory/interfaces/memory.types';

export type ClaimStatus = 'completed' | 'partial' | 'already_claimed';

export interface ClaimGuestResult {
  status: ClaimStatus;
  history: 'claimed' | 'already_claimed' | 'none';
  memory: 'claimed' | 'already_claimed' | 'none';
  vectors: 'claimed' | 'already_claimed' | 'unavailable';
}

@Injectable()
export class ClaimService {
  private readonly logger = new Logger(ClaimService.name);

  constructor(
    private readonly milvusService: MilvusService,
    private readonly prisma: PrismaService,
  ) {}

  async claimGuest(
    guestUserId: string,
    sessionId: string,
    userId: string,
  ): Promise<ClaimGuestResult> {
    requireGuestUserId(guestUserId);
    requireSafePathSegment(sessionId, '会话标识');
    requireSafePathSegment(userId, '用户标识');

    const history = await this.claimHistory(guestUserId, sessionId, userId);
    const memory = await this.claimMemory(guestUserId, sessionId, userId);
    const vectors = await this.claimVectors(guestUserId, sessionId, userId);

    if (vectors === 'unavailable') {
      return { status: 'partial', history, memory, vectors };
    }
    const already =
      (history === 'already_claimed' || history === 'none') &&
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
  ): Promise<'claimed' | 'already_claimed' | 'none'> {
    return this.prisma.$transaction(async (tx) => {
      const [source, target] = await Promise.all([
        tx.chatSessionRecord.findUnique({
          where: {
            ownerId_sessionId: { ownerId: guestUserId, sessionId },
          },
        }),
        tx.chatSessionRecord.findUnique({
          where: { ownerId_sessionId: { ownerId: userId, sessionId } },
        }),
      ]);
      if (!source) return target ? 'already_claimed' : 'none';

      const sourceMessages = Array.isArray(source.messages)
        ? source.messages
        : [];
      const targetMessages =
        target && Array.isArray(target.messages) ? target.messages : [];
      const messages = JSON.parse(
        JSON.stringify([...sourceMessages, ...targetMessages]),
      ) as Prisma.InputJsonValue;
      await tx.chatSessionRecord.upsert({
        where: { ownerId_sessionId: { ownerId: userId, sessionId } },
        create: {
          ownerId: userId,
          sessionId,
          messages,
          createdAt: source.createdAt,
          updatedAt: source.updatedAt,
        },
        update: { messages },
      });
      await tx.chatSessionRecord.delete({
        where: {
          ownerId_sessionId: { ownerId: guestUserId, sessionId },
        },
      });
      return 'claimed';
    });
  }

  private async claimMemory(
    guestUserId: string,
    sessionId: string,
    userId: string,
  ): Promise<'claimed' | 'already_claimed' | 'none'> {
    return this.prisma.$transaction(async (tx) => {
      const [
        sourceProfile,
        targetProfile,
        sourceMemoryCount,
        targetMemoryCount,
      ] = await Promise.all([
        tx.userProfileRecord.findUnique({
          where: {
            ownerId_sessionId: { ownerId: guestUserId, sessionId },
          },
        }),
        tx.userProfileRecord.findUnique({
          where: { ownerId_sessionId: { ownerId: userId, sessionId } },
        }),
        tx.memoryRecord.count({
          where: { ownerId: guestUserId, sessionId },
        }),
        tx.memoryRecord.count({ where: { ownerId: userId, sessionId } }),
      ]);

      if (!sourceProfile && sourceMemoryCount === 0) {
        return targetProfile || targetMemoryCount > 0
          ? 'already_claimed'
          : 'none';
      }

      if (sourceProfile) {
        const sourcePreferences =
          sourceProfile.preferences as unknown as UserProfile['preferences'];
        const targetPreferences = targetProfile?.preferences as unknown as
          | UserProfile['preferences']
          | undefined;
        const sourceFacts = sourceProfile.facts as Record<string, string>;
        const targetFacts = (targetProfile?.facts ?? {}) as Record<
          string,
          string
        >;
        const preferences: UserProfile['preferences'] = {
          favoriteCharacters: [
            ...new Set([
              ...sourcePreferences.favoriteCharacters,
              ...(targetPreferences?.favoriteCharacters ?? []),
            ]),
          ],
          interests: [
            ...new Set([
              ...sourcePreferences.interests,
              ...(targetPreferences?.interests ?? []),
            ]),
          ],
          location: targetPreferences?.location ?? sourcePreferences.location,
        };
        await tx.userProfileRecord.upsert({
          where: { ownerId_sessionId: { ownerId: userId, sessionId } },
          create: {
            ownerId: userId,
            sessionId,
            preferences: preferences as unknown as Prisma.InputJsonValue,
            facts: { ...sourceFacts, ...targetFacts },
            summary: targetProfile?.summary || sourceProfile.summary,
            createdAt: sourceProfile.createdAt,
            updatedAt: new Date(),
          },
          update: {
            preferences: preferences as unknown as Prisma.InputJsonValue,
            facts: { ...sourceFacts, ...targetFacts },
            summary: targetProfile?.summary || sourceProfile.summary,
          },
        });
        await tx.userProfileRecord.delete({
          where: {
            ownerId_sessionId: { ownerId: guestUserId, sessionId },
          },
        });
      }

      if (sourceMemoryCount > 0) {
        await tx.memoryRecord.updateMany({
          where: { ownerId: guestUserId, sessionId },
          data: { ownerId: userId },
        });
      }
      return 'claimed';
    });
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
      if (!source.data.length) return 'already_claimed';

      await client.upsert({
        collection_name: 'memory_embeddings',
        data: source.data.map((record) => ({ ...record, user_id: userId })),
      });
      await client.delete({
        collection_name: 'memory_embeddings',
        filter: `user_id == "${guestUserId}" && session_id == "${sessionId}"`,
      });
      return 'claimed';
    } catch {
      this.logger.warn('Guest vector claim is incomplete; retry is safe');
      return 'unavailable';
    }
  }
}
