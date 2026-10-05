import type { PrismaService } from '../prisma/prisma.service';
import { CommunityService } from './community.service';
import { CommunityModerationService } from './community.moderation.service';
function fixture() {
  const member = {
    id: 'actor',
    userId: 'user-a',
    roomId: 'readers-lobby',
    isModerator: true,
  };
  const tx = {
    communityMember: {
      findUnique: jest.fn().mockResolvedValue(member),
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'target', isModerator: false }),
      update: jest.fn(),
    },
    communityEvent: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    communityMessage: { findFirst: jest.fn(), update: jest.fn() },
    communityRoom: {
      update: jest.fn().mockResolvedValue({ lastEventSeq: 1n }),
    },
    $queryRaw: jest.fn(),
  };
  const db = {
    ...tx,
    $transaction: jest.fn(
      async (callback: (tx: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  } as unknown as PrismaService;
  return {
    tx,
    service: new CommunityModerationService(db, new CommunityService(db)),
  };
}
const input = {
  clientActionId: 'f8fdbcef-68e6-4606-9e84-9e1e3b3b1a38',
  minutes: 10 as const,
  reason: 'spam',
};
it('rejects_non_moderator_before_mutation', async () => {
  const { tx, service } = fixture();
  tx.communityMember.findUnique.mockResolvedValue({
    id: 'actor',
    isModerator: false,
  });
  await expect(service.hide('user-a', 'message', 'spam')).rejects.toMatchObject(
    { status: 403 },
  );
  expect(tx.communityMessage.update).not.toHaveBeenCalled();
});
it('rejects_self_or_moderator_mute', async () => {
  const { tx, service } = fixture();
  await expect(service.mute('user-a', 'actor', input)).rejects.toMatchObject({
    status: 400,
  });
  tx.communityMember.findFirst.mockResolvedValue({
    id: 'target',
    isModerator: true,
  });
  await expect(service.mute('user-a', 'target', input)).rejects.toMatchObject({
    status: 403,
  });
  expect(tx.communityMember.update).not.toHaveBeenCalled();
});
it('muting_is_not_extended_by_duplicate_request', async () => {
  const { tx, service } = fixture();
  const first = await service.mute('user-a', 'target', input);
  const event = tx.communityEvent.create.mock.calls[0][0].data;
  tx.communityEvent.findUnique.mockResolvedValue(event);
  const second = await service.mute('user-a', 'target', input);
  expect(second).toEqual(first);
  expect(tx.communityMember.update).toHaveBeenCalledTimes(1);
  await expect(
    service.mute('user-a', 'target', { ...input, minutes: 60 }),
  ).rejects.toMatchObject({ status: 409 });
});
it('does_not_shorten_existing_longer_mute', async () => {
  const { tx, service } = fixture();
  const mutedUntil = new Date(Date.now() + 3600000);
  tx.communityMember.findFirst.mockResolvedValue({
    id: 'target',
    isModerator: false,
    mutedUntil,
  });
  expect((await service.mute('user-a', 'target', input)).mutedUntil).toBe(
    mutedUntil.toISOString(),
  );
});
