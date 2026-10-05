import { Inject, Injectable, Optional } from '@nestjs/common';
import { Prisma, type CommunityMember } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  COMMUNITY_ROOM,
  COMMUNITY_ROOM_ID,
  CONSENT_VERSION,
  AVATAR_CONSENT_VERSION,
  communityError,
  messageRequestHash,
  normalizeMessage,
  parseSequence,
  POLICY,
} from './community.policy';
import { parseSend } from './dto/community.dto';
import { messageSelect, projectMessage } from './community.projection';
import type {
  CommunitySummary,
  MessageDTO,
  MessagePage,
  MessageQuery,
  SendMessageInput,
} from './community.types';

@Injectable()
export class CommunityService {
  readonly roomId: string;
  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(COMMUNITY_ROOM) roomId?: string,
  ) {
    this.roomId = roomId ?? COMMUNITY_ROOM_ID;
  }
  async member(
    userId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<CommunityMember> {
    const member = await tx.communityMember.findUnique({
      where: { roomId_userId: { roomId: this.roomId, userId } },
    });
    if (!member) throw communityError(403, 'COMMUNITY_JOIN_REQUIRED');
    return member;
  }
  async lockRoom(tx: Prisma.TransactionClient): Promise<void> {
    // One room lock orders allocation AND commit; a database sequence cannot do this.
    await tx.$queryRaw`SELECT "id" FROM "CommunityRoom" WHERE "id" = ${this.roomId} FOR UPDATE`;
  }
  async nextSequence(tx: Prisma.TransactionClient): Promise<bigint> {
    const room = await tx.communityRoom.update({
      where: { id: this.roomId },
      data: { lastEventSeq: { increment: 1 } },
      select: { lastEventSeq: true },
    });
    return room.lastEventSeq;
  }
  async join(
    userId: string,
    consentVersion: string,
  ): Promise<CommunitySummary> {
    if (![CONSENT_VERSION, AVATAR_CONSENT_VERSION].includes(consentVersion))
      throw communityError(400, 'COMMUNITY_CONSENT_REQUIRED');
    await this.prisma.$transaction(async (tx) => {
      await tx.communityRoom.upsert({
        where: { id: this.roomId },
        create: { id: this.roomId },
        update: {},
      });
      await this.lockRoom(tx);
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!user) throw communityError(401, 'COMMUNITY_AUTH_INVALID');
      const room = await tx.communityRoom.findUniqueOrThrow({
        where: { id: this.roomId },
        select: { lastEventSeq: true },
      });
      await tx.communityMember.upsert({
        where: { roomId_userId: { roomId: this.roomId, userId } },
        create: {
          roomId: this.roomId,
          userId,
          consentVersion,
          lastReadSeq: room.lastEventSeq,
        },
        update:
          consentVersion === AVATAR_CONSENT_VERSION ? { consentVersion } : {},
      });
    });
    return this.summary(userId);
  }
  private async summaryIn(
    tx: Prisma.TransactionClient,
    member: CommunityMember,
  ): Promise<CommunitySummary> {
    const room = await tx.communityRoom.findUnique({
      where: { id: this.roomId },
      select: { lastEventSeq: true },
    });
    if (!room) throw communityError(503, 'COMMUNITY_UNAVAILABLE');
    const where = {
      roomId: this.roomId,
      removedAt: null,
      authorMemberId: { not: member.id },
      createdSeq: { gt: member.lastReadSeq },
      reads: { none: { memberId: member.id } },
    };
    const [unreadCount, replyUnreadCount, mentionUnreadCount] =
      await Promise.all([
        tx.communityMessage.count({ where }),
        tx.communityMessage.count({
          where: {
            ...where,
            replyTo: { is: { roomId: this.roomId, authorMemberId: member.id } },
          },
        }),
        tx.communityMessage.count({
          where: {
            ...where,
            mentions: { array_contains: [{ memberId: member.id }] },
          },
        }),
      ]);
    return {
      memberId: member.id,
      isModerator: member.isModerator,
      mutedUntil: member.mutedUntil?.toISOString() ?? null,
      lastReadSeq: member.lastReadSeq.toString(),
      unreadCount,
      replyUnreadCount,
      latestEventSeq: room.lastEventSeq.toString(),
      mentionUnreadCount,
      consentVersion: member.consentVersion,
    };
  }
  summary(userId: string): Promise<CommunitySummary> {
    return this.prisma.$transaction(
      async (tx) => this.summaryIn(tx, await this.member(userId, tx)),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async listMessages(
    userId: string,
    query: MessageQuery,
  ): Promise<MessagePage> {
    const limit = query.limit ?? 50;
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      (query.before && query.after)
    )
      throw communityError(400, 'COMMUNITY_INVALID_INPUT');
    const before =
      query.before === undefined ? undefined : parseSequence(query.before);
    const after =
      query.after === undefined ? undefined : parseSequence(query.after);
    return this.prisma.$transaction(
      async (tx) => {
        await this.member(userId, tx);
        const room = await tx.communityRoom.findUnique({
          where: { id: this.roomId },
          select: { lastEventSeq: true },
        });
        if (!room) throw communityError(503, 'COMMUNITY_UNAVAILABLE');
        const rows = await tx.communityMessage.findMany({
          where: {
            roomId: this.roomId,
            ...(before === undefined ? {} : { createdSeq: { lt: before } }),
            ...(after === undefined ? {} : { createdSeq: { gt: after } }),
          },
          orderBy: { createdSeq: after === undefined ? 'desc' : 'asc' },
          take: limit + 1,
          select: messageSelect,
        });
        const hasMore = rows.length > limit;
        const selected = rows.slice(0, limit);
        const nextCursor = selected.at(-1)?.createdSeq.toString() ?? null;
        if (after === undefined) selected.reverse();
        return {
          messages: selected.map(projectMessage),
          hasMore,
          nextCursor,
          latestEventSeq: room.lastEventSeq.toString(),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async send(userId: string, input: SendMessageInput): Promise<MessageDTO> {
    const body = parseSend(input);
    const content = normalizeMessage(body.content);
    const requestHash = messageRequestHash(
      content,
      body.replyToId ?? null,
      body.mentionMemberIds,
    );
    return this.prisma.$transaction(async (tx) => {
      await this.lockRoom(tx);
      const member = await this.member(userId, tx);
      const existing = await tx.communityMessage.findUnique({
        where: {
          roomId_authorMemberId_clientMessageId: {
            roomId: this.roomId,
            authorMemberId: member.id,
            clientMessageId: body.clientMessageId,
          },
        },
        select: { ...messageSelect, requestHash: true },
      });
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw communityError(409, 'COMMUNITY_IDEMPOTENCY_CONFLICT');
        return projectMessage(existing);
      }
      const ids = body.mentionMemberIds ?? [];
      const targets = ids.length
        ? await tx.communityMember.findMany({
            where: { roomId: this.roomId, id: { in: ids } },
            select: { id: true, user: { select: { name: true } } },
          })
        : [];
      if (targets.length !== ids.length)
        throw communityError(404, 'COMMUNITY_MEMBER_NOT_FOUND');
      const mentions = targets.map((target) => ({
        memberId: target.id,
        name: target.user.name,
      }));
      const now = new Date();
      if (member.mutedUntil && member.mutedUntil > now)
        throw communityError(403, 'COMMUNITY_MUTED');
      const sameWindow =
        member.sendWindowStartedAt &&
        now.getTime() - member.sendWindowStartedAt.getTime() < 60_000;
      if (sameWindow && member.sendCount >= POLICY.sendsPerMinute)
        throw communityError(
          429,
          'COMMUNITY_RATE_LIMITED',
          Math.max(
            1,
            Math.ceil(
              (member.sendWindowStartedAt!.getTime() + 60_000 - now.getTime()) /
                1000,
            ),
          ),
        );
      if (body.replyToId) {
        const reply = await tx.communityMessage.findFirst({
          where: { id: body.replyToId, roomId: this.roomId },
          select: { removedAt: true },
        });
        if (!reply) throw communityError(404, 'COMMUNITY_MESSAGE_NOT_FOUND');
        if (reply.removedAt)
          throw communityError(410, 'COMMUNITY_REPLY_UNAVAILABLE');
      }
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });
      if (!user) throw communityError(401, 'COMMUNITY_AUTH_INVALID');
      await tx.communityMember.update({
        where: { id: member.id },
        data: {
          sendCount: sameWindow ? member.sendCount + 1 : 1,
          sendWindowStartedAt: sameWindow ? member.sendWindowStartedAt : now,
        },
      });
      const seq = await this.nextSequence(tx);
      const row = await tx.communityMessage.create({
        data: {
          roomId: this.roomId,
          authorMemberId: member.id,
          authorName: user.name,
          clientMessageId: body.clientMessageId,
          requestHash,
          content,
          mentions,
          replyToId: body.replyToId ?? null,
          createdSeq: seq,
        },
        select: messageSelect,
      });
      await tx.communityEvent.create({
        data: {
          roomId: this.roomId,
          seq,
          kind: 'MESSAGE_CREATED',
          messageId: row.id,
          actorMemberId: member.id,
        },
      });
      return projectMessage(row);
    });
  }
  async remove(userId: string, messageId: string): Promise<MessageDTO> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockRoom(tx);
      const member = await this.member(userId, tx);
      const row = await tx.communityMessage.findFirst({
        where: { id: messageId, roomId: this.roomId },
        select: messageSelect,
      });
      if (!row) throw communityError(404, 'COMMUNITY_MESSAGE_NOT_FOUND');
      if (row.authorMemberId !== member.id)
        throw communityError(403, 'COMMUNITY_NOT_AUTHOR');
      if (row.removedAt) return projectMessage(row);
      const removed = await tx.communityMessage.update({
        where: { id: row.id },
        data: { content: null, removedAt: new Date(), removalKind: 'AUTHOR' },
        select: messageSelect,
      });
      const seq = await this.nextSequence(tx);
      await tx.communityEvent.create({
        data: {
          roomId: this.roomId,
          seq,
          kind: 'MESSAGE_REMOVED',
          messageId: row.id,
          actorMemberId: member.id,
        },
      });
      return projectMessage(removed);
    });
  }
  markRead(userId: string, throughSeq: string): Promise<CommunitySummary> {
    const seq = parseSequence(throughSeq);
    return this.prisma.$transaction(async (tx) => {
      await this.lockRoom(tx);
      const member = await this.member(userId, tx);
      const room = await tx.communityRoom.findUnique({
        where: { id: this.roomId },
        select: { lastEventSeq: true },
      });
      if (!room || seq > room.lastEventSeq)
        throw communityError(400, 'COMMUNITY_INVALID_CURSOR');
      const current =
        seq > member.lastReadSeq
          ? await tx.communityMember.update({
              where: { id: member.id },
              data: { lastReadSeq: seq },
            })
          : member;
      return this.summaryIn(tx, current);
    });
  }

  async markVisibleRead(
    userId: string,
    messageIds: string[],
  ): Promise<CommunitySummary> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockRoom(tx);
      const member = await this.member(userId, tx);
      const ids = [...new Set(messageIds)];
      const messages = await tx.communityMessage.findMany({
        where: { roomId: this.roomId, id: { in: ids } },
        select: { id: true },
      });
      if (messages.length !== ids.length)
        throw communityError(404, 'COMMUNITY_MESSAGE_NOT_FOUND');
      await tx.communityMessageRead.createMany({
        data: ids.map((messageId) => ({ memberId: member.id, messageId })),
        skipDuplicates: true,
      });
      return this.summaryIn(tx, member);
    });
  }

  async unreadTarget(userId: string, kind: 'all' | 'mentions', after?: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const member = await this.member(userId, tx);
        const row = await tx.communityMessage.findFirst({
          where: {
            roomId: this.roomId,
            removedAt: null,
            authorMemberId: { not: member.id },
            createdSeq: {
              gt:
                after === undefined
                  ? member.lastReadSeq
                  : parseSequence(after) > member.lastReadSeq
                    ? parseSequence(after)
                    : member.lastReadSeq,
            },
            reads: { none: { memberId: member.id } },
            ...(kind === 'mentions'
              ? { mentions: { array_contains: [{ memberId: member.id }] } }
              : {}),
          },
          orderBy: { createdSeq: 'asc' },
          select: { id: true, createdSeq: true },
        });
        return row ? { id: row.id, seq: row.createdSeq.toString() } : null;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async messageContext(userId: string, id: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.member(userId, tx);
        const target = await tx.communityMessage.findFirst({
          where: { roomId: this.roomId, id },
          select: { createdSeq: true },
        });
        if (!target) throw communityError(404, 'COMMUNITY_MESSAGE_NOT_FOUND');
        const [before, after, room] = await Promise.all([
          tx.communityMessage.findMany({
            where: {
              roomId: this.roomId,
              createdSeq: { lt: target.createdSeq },
            },
            orderBy: { createdSeq: 'desc' },
            take: 26,
            select: messageSelect,
          }),
          tx.communityMessage.findMany({
            where: {
              roomId: this.roomId,
              createdSeq: { gte: target.createdSeq },
            },
            orderBy: { createdSeq: 'asc' },
            take: 26,
            select: messageSelect,
          }),
          tx.communityRoom.findUniqueOrThrow({
            where: { id: this.roomId },
            select: { lastEventSeq: true },
          }),
        ]);
        return {
          messages: [
            ...before.slice(0, 25).reverse(),
            ...after.slice(0, 25),
          ].map(projectMessage),
          hasOlder: before.length > 25,
          hasNewer: after.length > 25,
          latestEventSeq: room.lastEventSeq.toString(),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
