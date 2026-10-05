import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { communityDbFixture } from '../../test/support/community-db-fixture';
import { CommunityService } from './community.service';
function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
describe('isolated community database invariants', () => {
  let fixture: ReturnType<typeof communityDbFixture>;
  beforeEach(() => {
    fixture = communityDbFixture();
  });
  afterEach(async () => {
    if (fixture) await fixture.cleanup();
  });
  it('visible_latest_read_preserves_older_unread_mention_and_target', async () => {
    const reader = await fixture.user(),
      author = await fixture.user();
    const member = await fixture.service.summary(reader);
    const old = await fixture.service.send(author, {
      clientMessageId: randomUUID(),
      content: 'older mention',
      mentionMemberIds: [member.memberId],
    });
    const latest = await fixture.service.send(author, {
      clientMessageId: randomUUID(),
      content: 'latest ordinary',
    });
    const result = await fixture.service.markVisibleRead(reader, [latest.id]);
    expect(result.unreadCount).toBe(1);
    expect(result.mentionUnreadCount).toBe(1);
    expect((await fixture.service.unreadTarget(reader, 'mentions'))?.id).toBe(
      old.id,
    );
    const context = await fixture.service.messageContext(reader, old.id);
    expect(context.messages.map((m) => m.id)).toContain(old.id);
    const done = await fixture.service.markVisibleRead(reader, [old.id]);
    expect(done.unreadCount).toBe(0);
    expect(done.mentionUnreadCount).toBe(0);
  });
  it('concurrent_same_key_creates_one_message_and_event', async () => {
    const user = await fixture.user();
    const input = {
      clientMessageId: randomUUID(),
      content: 'Concurrent fixture',
    };
    const results = await Promise.all([
      fixture.service.send(user, input),
      fixture.service.send(user, input),
    ]);
    expect(results[0].id).toBe(results[1].id);
    expect(
      await fixture.db.communityMessage.count({
        where: { roomId: fixture.roomId },
      }),
    ).toBe(1);
    expect(
      await fixture.db.communityEvent.count({
        where: { roomId: fixture.roomId, kind: 'MESSAGE_CREATED' },
      }),
    ).toBe(1);
  });
  it('commit_order_does_not_skip_late_transaction', async () => {
    const user = await fixture.user();
    const acquired = barrier(),
      release = barrier(),
      secondStarted = barrier();
    class Held extends CommunityService {
      override async lockRoom(tx: Prisma.TransactionClient) {
        await super.lockRoom(tx);
        acquired.release();
        await release.promise;
      }
    }
    class Second extends CommunityService {
      override async lockRoom(tx: Prisma.TransactionClient) {
        secondStarted.release();
        await super.lockRoom(tx);
      }
    }
    const first = new Held(
      fixture.db as unknown as PrismaService,
      fixture.roomId,
    ).send(user, { clientMessageId: randomUUID(), content: 'First' });
    await acquired.promise;
    const second = new Second(
      fixture.db as unknown as PrismaService,
      fixture.roomId,
    ).send(user, { clientMessageId: randomUUID(), content: 'Second' });
    await secondStarted.promise;
    release.release();
    const [a, b] = await Promise.all([first, second]);
    expect(BigInt(b.seq)).toBe(BigInt(a.seq) + 1n);
    const page = await fixture.service.listMessages(user, { limit: 50 });
    expect(page.messages.map((m) => m.id)).toEqual([a.id, b.id]);
    expect(page.latestEventSeq).toBe(b.seq);
  });
  it('rate_limit_survives_connection_change_and_idempotent_retry', async () => {
    const user = await fixture.user();
    const input = { clientMessageId: randomUUID(), content: 'First' };
    await fixture.service.send(user, input);
    for (let n = 1; n < 20; n++)
      await fixture.service.send(user, {
        clientMessageId: randomUUID(),
        content: `Fixture ${n}`,
      });
    const reconnected = new CommunityService(
      fixture.db as unknown as PrismaService,
      fixture.roomId,
    );
    await expect(reconnected.send(user, input)).resolves.toMatchObject({
      clientMessageId: input.clientMessageId,
    });
    await expect(
      reconnected.send(user, {
        clientMessageId: randomUUID(),
        content: 'Over quota',
      }),
    ).rejects.toMatchObject({ status: 429 });
  });
  it('private_identifiers_never_enter_public_projection_and_removed_quotes_stay_redacted', async () => {
    const user = await fixture.user(),
      other = await fixture.user();
    const original = await fixture.service.send(user, {
      clientMessageId: randomUUID(),
      content: 'Original fixture',
    });
    await fixture.service.send(other, {
      clientMessageId: randomUUID(),
      content: 'Reply',
      replyToId: original.id,
    });
    await fixture.service.remove(user, original.id);
    const page = await fixture.service.listMessages(other, { limit: 50 });
    expect(page.messages[0].content).toBeNull();
    expect(page.messages[1].replyTo?.excerpt).toBeNull();
    const serialized = JSON.stringify(page);
    expect(serialized).not.toContain(user);
    expect(serialized).not.toContain('@example.invalid');
    await expect(
      fixture.service.send(other, {
        clientMessageId: randomUUID(),
        content: 'Invalid private reference',
        replyToId: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
