import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { resolveIsolatedDatabaseUrl } from '../../src/prisma/testing/isolated-database';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { CommunityService } from '../../src/community/community.service';
export function communityDbFixture() {
  // Resolve and reject the target before creating a client; never load .env here.
  const url = resolveIsolatedDatabaseUrl(process.env);
  const limit = new URL(url).searchParams.get('connection_limit');
  if (limit !== null && (!/^\d+$/.test(limit) || Number(limit) < 2))
    throw new Error('Community race tests need at least two connections.');
  const db = new PrismaClient({
    datasources: { db: { url } },
    transactionOptions: { maxWait: 10000, timeout: 10000 },
  });
  const roomId = `test-community-${randomUUID()}`;
  const userIds: string[] = [];
  const memberIds: string[] = [];
  const service = new CommunityService(db as unknown as PrismaService, roomId);
  return {
    db,
    roomId,
    service,
    async user() {
      const id = randomUUID();
      userIds.push(id);
      await db.user.create({
        data: {
          id,
          email: `community-${id}@example.invalid`,
          name: 'Community fixture',
          passwordHash: 'fixture-not-a-valid-password-hash',
        },
      });
      const summary = await service.join(id, '2026-10-04');
      memberIds.push(summary.memberId);
      return id;
    },
    async cleanup() {
      // All writes are confined to this unique room and explicit fixture identities.
      await db.communityEvent.deleteMany({ where: { roomId } });
      await db.communityMessage.deleteMany({ where: { roomId } });
      if (memberIds.length)
        await db.communityMember.deleteMany({
          where: { roomId, id: { in: memberIds } },
        });
      await db.communityRoom.deleteMany({ where: { id: roomId } });
      if (userIds.length)
        await db.user.deleteMany({ where: { id: { in: userIds } } });
      await db.$disconnect();
    },
  };
}
