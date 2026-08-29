import { BadRequestException } from '@nestjs/common';
import { MilvusService } from '../milvus/milvus.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClaimService } from './claim.service';

describe('ClaimService', () => {
  const guestId = 'guest_550e8400-e29b-41d4-a716-446655440000';
  const userId = 'user-1';
  const sessionId = 'session-1';
  const chats = new Map<string, any>();
  const profiles = new Map<string, any>();
  const memories: any[] = [];
  let milvus: { query: jest.Mock; upsert: jest.Mock; delete: jest.Mock };
  let service: ClaimService;

  const key = (ownerId: string, session: string) => `${ownerId}:${session}`;

  beforeEach(() => {
    chats.clear();
    profiles.clear();
    memories.length = 0;
    milvus = {
      query: jest.fn().mockResolvedValue({ data: [] }),
      upsert: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    };

    const tx: any = {
      chatSessionRecord: {
        findUnique: jest.fn(async ({ where }: any) => {
          const scope = where.ownerId_sessionId;
          return chats.get(key(scope.ownerId, scope.sessionId)) ?? null;
        }),
        upsert: jest.fn(async ({ where, create, update }: any) => {
          const scope = where.ownerId_sessionId;
          const recordKey = key(scope.ownerId, scope.sessionId);
          chats.set(
            recordKey,
            chats.has(recordKey)
              ? { ...chats.get(recordKey), ...update }
              : create,
          );
        }),
        delete: jest.fn(async ({ where }: any) => {
          const scope = where.ownerId_sessionId;
          chats.delete(key(scope.ownerId, scope.sessionId));
        }),
      },
      userProfileRecord: {
        findUnique: jest.fn(async ({ where }: any) => {
          const scope = where.ownerId_sessionId;
          return profiles.get(key(scope.ownerId, scope.sessionId)) ?? null;
        }),
        upsert: jest.fn(async ({ where, create, update }: any) => {
          const scope = where.ownerId_sessionId;
          const recordKey = key(scope.ownerId, scope.sessionId);
          profiles.set(
            recordKey,
            profiles.has(recordKey)
              ? { ...profiles.get(recordKey), ...update }
              : create,
          );
        }),
        delete: jest.fn(async ({ where }: any) => {
          const scope = where.ownerId_sessionId;
          profiles.delete(key(scope.ownerId, scope.sessionId));
        }),
      },
      memoryRecord: {
        count: jest.fn(
          async ({ where }: any) =>
            memories.filter(
              (memory) =>
                memory.ownerId === where.ownerId &&
                memory.sessionId === where.sessionId,
            ).length,
        ),
        updateMany: jest.fn(async ({ where, data }: any) => {
          for (const memory of memories) {
            if (
              memory.ownerId === where.ownerId &&
              memory.sessionId === where.sessionId
            ) {
              Object.assign(memory, data);
            }
          }
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: any) => unknown) =>
        callback(tx),
      ),
    } as unknown as PrismaService;
    service = new ClaimService(
      { getClient: () => milvus } as unknown as MilvusService,
      prisma,
    );
  });

  const guestChat = () => ({
    ownerId: guestId,
    sessionId,
    messages: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });

  const guestProfile = () => ({
    ownerId: guestId,
    sessionId,
    preferences: { favoriteCharacters: [], interests: ['武侠'] },
    facts: { city: '杭州' },
    summary: '',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });

  it('claims database history, profile, and memories into the signed-in owner', async () => {
    chats.set(key(guestId, sessionId), guestChat());
    profiles.set(key(guestId, sessionId), guestProfile());
    memories.push({ id: 'memory', ownerId: guestId, sessionId });

    await expect(
      service.claimGuest(guestId, sessionId, userId),
    ).resolves.toEqual({
      status: 'completed',
      history: 'claimed',
      memory: 'claimed',
      vectors: 'already_claimed',
    });
    expect(chats.has(key(guestId, sessionId))).toBe(false);
    expect(chats.has(key(userId, sessionId))).toBe(true);
    expect(profiles.has(key(userId, sessionId))).toBe(true);
    expect(memories[0].ownerId).toBe(userId);
  });

  it('is idempotent after the target records already exist', async () => {
    chats.set(key(userId, sessionId), { ...guestChat(), ownerId: userId });

    await expect(
      service.claimGuest(guestId, sessionId, userId),
    ).resolves.toEqual({
      status: 'already_claimed',
      history: 'already_claimed',
      memory: 'none',
      vectors: 'already_claimed',
    });
  });

  it('rejects the legacy shared anonymous identity', async () => {
    await expect(
      service.claimGuest('anonymous', sessionId, userId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reports partial when the private vector collection is unavailable', async () => {
    milvus.query.mockRejectedValue(new Error('unavailable'));

    const result = await service.claimGuest(guestId, sessionId, userId);

    expect(result.status).toBe('partial');
    expect(result.vectors).toBe('unavailable');
  });

  it('rewrites vector ownership and removes guest copies', async () => {
    milvus.query.mockResolvedValue({
      data: [{ id: 'memory', user_id: guestId, session_id: sessionId }],
    });

    const result = await service.claimGuest(guestId, sessionId, userId);

    expect(result.vectors).toBe('claimed');
    expect(milvus.upsert).toHaveBeenCalledWith({
      collection_name: 'memory_embeddings',
      data: [{ id: 'memory', user_id: userId, session_id: sessionId }],
    });
    expect(milvus.delete).toHaveBeenCalledWith({
      collection_name: 'memory_embeddings',
      filter: `user_id == "${guestId}" && session_id == "${sessionId}"`,
    });
  });
});
