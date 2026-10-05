import { HttpException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { CommunityService } from './community.service';
import { projectMessage } from './community.projection';
import { messageRequestHash } from './community.policy';

const roomId = 'readers-lobby';
const member = {
  id: 'member-a',
  userId: 'user-a',
  roomId,
  lastReadSeq: 0n,
  isModerator: false,
  mutedUntil: null,
  sendWindowStartedAt: null,
  sendCount: 0,
};
const message = {
  id: 'message-a',
  roomId,
  authorMemberId: member.id,
  authorName: 'Fixture reader',
  clientMessageId: 'ca92b968-9672-4bf5-bd96-f13d2ba69b35',
  requestHash: '',
  content: 'hello',
  createdSeq: 1n,
  createdAt: new Date(0),
  removedAt: null,
  removalKind: null,
  replyTo: null,
};
function setup() {
  const tx = {
    communityRoom: {
      findUnique: jest.fn().mockResolvedValue({ id: roomId, lastEventSeq: 1n }),
      upsert: jest.fn(),
      update: jest.fn().mockResolvedValue({ lastEventSeq: 2n }),
    },
    communityMember: {
      findUnique: jest.fn().mockResolvedValue({ ...member }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ ...member }),
    },
    communityMessage: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ ...message }),
      update: jest.fn().mockResolvedValue({
        ...message,
        content: null,
        removedAt: new Date(),
      }),
      count: jest.fn().mockResolvedValue(0),
    },
    communityEvent: { create: jest.fn() },
    communityMessageRead: { createMany: jest.fn() },
    user: {
      findUnique: jest.fn().mockResolvedValue({ name: 'Fixture reader' }),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const db = {
    ...tx,
    $transaction: jest.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  };
  return { tx, service: new CommunityService(db as unknown as PrismaService) };
}
async function status(promise: Promise<unknown>, expected: number) {
  await expect(promise).rejects.toBeInstanceOf(HttpException);
  await expect(promise).rejects.toMatchObject({ status: expected });
}
describe('community persistent authorization', () => {
  it('rejects_mentions_of_people_outside_this_room_before_writing', async () => {
    const { service, tx } = setup();
    await status(
      service.send('user-a', {
        clientMessageId: message.clientMessageId,
        content: 'hello',
        mentionMemberIds: ['b83693dc-d48d-4011-b79d-259ddc69b397'],
      } as Parameters<CommunityService['send']>[1]),
      404,
    );
    expect(tx.communityMessage.create).not.toHaveBeenCalled();
  });
  it('includes_mentions_in_idempotency_identity', async () => {
    const { service, tx } = setup();
    tx.communityMessage.findUnique.mockResolvedValue({
      ...message,
      requestHash: messageRequestHash('hello', null),
    });
    await status(
      service.send('user-a', {
        clientMessageId: message.clientMessageId,
        content: 'hello',
        mentionMemberIds: ['b83693dc-d48d-4011-b79d-259ddc69b397'],
      } as Parameters<CommunityService['send']>[1]),
      409,
    );
  });
  it('writes_only_visible_room_message_receipts_without_advancing_cursor', async () => {
    const { service, tx } = setup();
    tx.communityMessage.findMany.mockResolvedValue([{ id: message.id }]);
    await service.markVisibleRead('user-a', [message.id]);
    expect(tx.communityMessageRead.createMany).toHaveBeenCalledWith({
      data: [{ memberId: member.id, messageId: message.id }],
      skipDuplicates: true,
    });
    expect(tx.communityMember.update).not.toHaveBeenCalled();
    expect(tx.communityMessage.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        reads: { none: { memberId: member.id } },
      }),
    });
  });
  it('rejects_foreign_visible_ids_before_receipt_write', async () => {
    const { service, tx } = setup();
    await status(service.markVisibleRead('user-a', ['foreign']), 404);
    expect(tx.communityMessageRead.createMany).not.toHaveBeenCalled();
  });
  it('finds_next_unread_mention_by_member_id_not_reply', async () => {
    const { service, tx } = setup();
    await service.unreadTarget('user-a', 'mentions', '3');
    expect(tx.communityMessage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          roomId,
          createdSeq: { gt: 3n },
          mentions: { array_contains: [{ memberId: member.id }] },
          reads: { none: { memberId: member.id } },
        }),
      }),
    );
  });
  it('requires_membership_before_message_query', async () => {
    const { service, tx } = setup();
    tx.communityMember.findUnique.mockResolvedValue(null);
    await status(service.listMessages('user-a', { limit: 50 }), 403);
    expect(tx.communityMessage.findMany).not.toHaveBeenCalled();
  });
  it('rejects_cross_room_or_private_reply', async () => {
    const { service, tx } = setup();
    await status(
      service.send('user-a', {
        clientMessageId: message.clientMessageId,
        content: 'hello',
        replyToId: 'b83693dc-d48d-4011-b79d-259ddc69b397',
      }),
      404,
    );
    expect(tx.communityMessage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ roomId }) }),
    );
    expect(tx.communityMessage.create).not.toHaveBeenCalled();
  });
  it('returns_existing_message_for_same_request_without_charging', async () => {
    const { service, tx } = setup();
    tx.communityMessage.findUnique.mockResolvedValue({
      ...message,
      requestHash: messageRequestHash('hello', null),
    });
    expect(
      (
        await service.send('user-a', {
          clientMessageId: message.clientMessageId,
          content: ' hello ',
        })
      ).id,
    ).toBe(message.id);
    expect(tx.communityMessage.create).not.toHaveBeenCalled();
    expect(tx.communityMember.update).not.toHaveBeenCalled();
  });
  it('rejects_changed_idempotent_request', async () => {
    const { service, tx } = setup();
    tx.communityMessage.findUnique.mockResolvedValue({
      ...message,
      requestHash: 'different',
    });
    await status(
      service.send('user-a', {
        clientMessageId: message.clientMessageId,
        content: 'hello',
      }),
      409,
    );
  });
  it('rejects_other_author_removal', async () => {
    const { service, tx } = setup();
    tx.communityMessage.findFirst.mockResolvedValue({
      ...message,
      authorMemberId: 'member-b',
    });
    await status(service.remove('user-a', message.id), 403);
    expect(tx.communityMessage.update).not.toHaveBeenCalled();
  });
  it('counts_only_visible_other_authors_as_unread', async () => {
    const { service, tx } = setup();
    await service.summary('user-a');
    expect(tx.communityMessage.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        roomId,
        removedAt: null,
        authorMemberId: { not: member.id },
        createdSeq: { gt: 0n },
      }),
    });
  });
  it('marks_read_monotonically', async () => {
    const { service, tx } = setup();
    tx.communityMember.findUnique.mockResolvedValue({
      ...member,
      lastReadSeq: 1n,
    });
    await service.markRead('user-a', '0');
    expect(tx.communityMember.update).not.toHaveBeenCalled();
    await status(service.markRead('user-a', '2'), 400);
  });
  it('locks_room_before_quota_or_business_writes', async () => {
    const { service, tx } = setup();
    await service.send('user-a', {
      clientMessageId: message.clientMessageId,
      content: 'hello',
    });
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.communityMessage.create.mock.invocationCallOrder[0],
    );
    expect(tx.communityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          roomId,
          seq: 2n,
          kind: 'MESSAGE_CREATED',
        }),
      }),
    );
  });
  it('persists_rate_limit_and_rejects_new_send_while_muted', async () => {
    const { service, tx } = setup();
    tx.communityMember.findUnique.mockResolvedValue({
      ...member,
      sendWindowStartedAt: new Date(),
      sendCount: 20,
    });
    await status(
      service.send('user-a', {
        clientMessageId: message.clientMessageId,
        content: 'hello',
      }),
      429,
    );
    tx.communityMember.findUnique.mockResolvedValue({
      ...member,
      mutedUntil: new Date(Date.now() + 60000),
    });
    await status(
      service.send('user-a', {
        clientMessageId: message.clientMessageId,
        content: 'hello',
      }),
      403,
    );
  });
  it('redacts_removed_reference_and_account_fields', () => {
    const result = projectMessage({
      ...message,
      replyTo: {
        ...message,
        id: 'reference',
        removedAt: new Date(),
        content: 'removed fixture',
      },
      userId: 'private-user',
      email: 'fixture@example.invalid',
    });
    expect(result.replyTo?.excerpt).toBeNull();
    expect(JSON.stringify(result)).not.toContain('private-user');
    expect(JSON.stringify(result)).not.toContain('fixture@example.invalid');
    expect(
      projectMessage({
        ...message,
        removedAt: new Date(),
        content: 'removed fixture',
      }).content,
    ).toBeNull();
  });
});
