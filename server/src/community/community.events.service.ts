import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CommunityService } from './community.service';
import { communityError, parseSequence, POLICY } from './community.policy';
import { messageSelect, projectMessage } from './community.projection';
import type { CommunityEventDTO } from './community.types';

const eventSelect = {
  seq: true,
  kind: true,
  message: { select: messageSelect },
} satisfies Prisma.CommunityEventSelect;
type EventRow = Prisma.CommunityEventGetPayload<{ select: typeof eventSelect }>;
@Injectable()
export class CommunityEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CommunityEventsService.name);
  private listeners = new Set<(event: CommunityEventDTO) => void>();
  private timer?: ReturnType<typeof setInterval>;
  private busy: Promise<void> | null = null;
  private sweptSeq = 0n;
  private stopped = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly community: CommunityService,
  ) {}
  async onModuleInit() {
    this.sweptSeq = await this.watermark();
    this.timer = setInterval(
      () =>
        void this.sweep().catch(() =>
          this.logger.warn('COMMUNITY_SWEEP_UNAVAILABLE'),
        ),
      POLICY.sweepMs,
    );
    this.timer.unref();
  }
  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.listeners.clear();
  }
  listen(callback: (event: CommunityEventDTO) => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
  async watermark() {
    const room = await this.prisma.communityRoom.findUnique({
      where: { id: this.community.roomId },
      select: { lastEventSeq: true },
    });
    return room?.lastEventSeq ?? 0n;
  }
  private frame(row: EventRow): CommunityEventDTO {
    if (row.message && row.kind !== 'MEMBER_MUTED')
      return {
        event:
          row.kind === 'MESSAGE_CREATED'
            ? 'message.created'
            : 'message.removed',
        data: { seq: row.seq.toString(), message: projectMessage(row.message) },
      };
    return { event: 'cursor', data: { seq: row.seq.toString() } };
  }
  async backfill(after: string) {
    const start = parseSequence(after);
    const end = await this.watermark();
    if (start > end) throw communityError(400, 'COMMUNITY_INVALID_CURSOR');
    if (end - start > BigInt(POLICY.replayLag))
      throw communityError(409, 'COMMUNITY_CURSOR_TOO_OLD');
    const events: CommunityEventDTO[] = [];
    let cursor = start;
    while (cursor < end) {
      const rows = await this.prisma.communityEvent.findMany({
        where: { roomId: this.community.roomId, seq: { gt: cursor, lte: end } },
        orderBy: { seq: 'asc' },
        take: POLICY.replayBatch,
        select: eventSelect,
      });
      if (!rows.length) throw communityError(503, 'COMMUNITY_EVENT_GAP');
      for (const row of rows) {
        if (row.seq !== cursor + 1n)
          throw communityError(503, 'COMMUNITY_EVENT_GAP');
        events.push(this.frame(row));
        cursor = row.seq;
      }
    }
    return { events, throughSeq: end.toString() };
  }
  sweep(): Promise<void> {
    if (this.busy) return this.busy;
    this.busy = this.sweepOnce().finally(() => {
      this.busy = null;
    });
    return this.busy;
  }
  private async sweepOnce() {
    if (this.stopped) return;
    if (!this.listeners.size) {
      const seq = await this.watermark();
      if (!this.listeners.size) this.sweptSeq = seq;
      return;
    }
    const rows = await this.prisma.communityEvent.findMany({
      where: { roomId: this.community.roomId, seq: { gt: this.sweptSeq } },
      orderBy: { seq: 'asc' },
      take: POLICY.replayBatch,
      select: eventSelect,
    });
    for (const row of rows) {
      if (this.stopped) return;
      if (row.seq <= this.sweptSeq) continue;
      const event = this.frame(row);
      for (const callback of this.listeners) {
        try {
          callback(event);
        } catch {
          this.logger.warn('COMMUNITY_DELIVERY_FAILED');
        }
      }
      this.sweptSeq = row.seq;
    }
  }
}
