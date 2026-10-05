import { CommunityEventsService } from './community.events.service';
import type { CommunityService } from './community.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('ordered public event recovery', () => {
  const roomId = 'readers-lobby';
  function setup() {
    const db = {
      communityRoom: {
        findUnique: jest.fn().mockResolvedValue({ lastEventSeq: 2n }),
      },
      communityEvent: {
        findMany: jest.fn().mockResolvedValue([
          { seq: 1n, kind: 'MEMBER_MUTED', message: null },
          {
            seq: 2n,
            kind: 'MESSAGE_CREATED',
            message: {
              id: 'fixture-message',
              roomId,
              authorMemberId: 'member-a',
              authorName: 'Reader',
              clientMessageId: 'fixture',
              createdSeq: 2n,
              createdAt: new Date(0),
              removedAt: new Date(1),
              content: null,
              replyTo: null,
            },
          },
        ]),
      },
    };
    const events = new CommunityEventsService(
      db as unknown as PrismaService,
      { roomId } as CommunityService,
    );
    return { db, events };
  }
  it('rejects_future_event_cursor', async () => {
    const { events } = setup();
    await expect(events.backfill('3')).rejects.toMatchObject({ status: 400 });
  });
  it('replay_projects_current_removed_state_and_hides_audit', async () => {
    const { events, db } = setup();
    const frames = await events.backfill('0');
    expect(frames.events[0]).toEqual({ event: 'cursor', data: { seq: '1' } });
    expect(frames.events[1]).toMatchObject({
      event: 'message.created',
      data: { seq: '2', message: { content: null, status: 'REMOVED' } },
    });
    expect(db.communityEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { roomId, seq: { gt: 0n, lte: 2n } } }),
    );
  });
  it('recovers_commit_without_notification_and_deduplicates', async () => {
    const { events } = setup();
    const receive = jest.fn();
    events.listen(receive);
    await events.sweep();
    await events.sweep();
    expect(receive).toHaveBeenCalledTimes(2);
    events.onModuleDestroy();
  });
  it('signals_reset_for_excessive_lag', async () => {
    const { events, db } = setup();
    db.communityRoom.findUnique.mockResolvedValue({ lastEventSeq: 1001n });
    await expect(events.backfill('0')).rejects.toMatchObject({ status: 409 });
  });
});
