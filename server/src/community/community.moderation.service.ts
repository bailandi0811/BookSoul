import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CommunityService } from './community.service';
import { communityError } from './community.policy';
import { parseHide, parseMute } from './dto/community.dto';
import { messageSelect, projectMessage } from './community.projection';
@Injectable()
export class CommunityModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly community: CommunityService,
  ) {}
  private async moderator(userId: string, tx: Prisma.TransactionClient) {
    const member = await this.community.member(userId, tx);
    if (!member.isModerator)
      throw communityError(403, 'COMMUNITY_MODERATOR_REQUIRED');
    return member;
  }
  async hide(userId: string, messageId: string, reason: string) {
    const body = parseHide({ reason });
    return this.prisma.$transaction(async (tx) => {
      await this.community.lockRoom(tx);
      const actor = await this.moderator(userId, tx);
      const message = await tx.communityMessage.findFirst({
        where: { id: messageId, roomId: this.community.roomId },
        select: messageSelect,
      });
      if (!message) throw communityError(404, 'COMMUNITY_MESSAGE_NOT_FOUND');
      if (message.removedAt) return projectMessage(message);
      const removed = await tx.communityMessage.update({
        where: { id: message.id },
        data: {
          content: null,
          removedAt: new Date(),
          removalKind: 'MODERATOR',
        },
        select: messageSelect,
      });
      const seq = await this.community.nextSequence(tx);
      await tx.communityEvent.create({
        data: {
          roomId: this.community.roomId,
          seq,
          kind: 'MESSAGE_REMOVED',
          messageId: message.id,
          actorMemberId: actor.id,
          reason: body.reason,
        },
      });
      return projectMessage(removed);
    });
  }
  async mute(
    userId: string,
    targetMemberId: string,
    input: { clientActionId: string; minutes: 10 | 60; reason: string },
  ) {
    const body = parseMute(input);
    const requestHash = createHash('sha256')
      .update(JSON.stringify([targetMemberId, body.minutes, body.reason]))
      .digest('hex');
    return this.prisma.$transaction(async (tx) => {
      await this.community.lockRoom(tx);
      const actor = await this.moderator(userId, tx);
      if (actor.id === targetMemberId)
        throw communityError(400, 'COMMUNITY_CANNOT_MUTE_SELF');
      const prior = await tx.communityEvent.findUnique({
        where: {
          roomId_actorMemberId_clientActionId: {
            roomId: this.community.roomId,
            actorMemberId: actor.id,
            clientActionId: body.clientActionId,
          },
        },
      });
      if (prior) {
        if (prior.requestHash !== requestHash || !prior.mutedUntil)
          throw communityError(409, 'COMMUNITY_IDEMPOTENCY_CONFLICT');
        return {
          memberId: targetMemberId,
          mutedUntil: prior.mutedUntil.toISOString(),
        };
      }
      const target = await tx.communityMember.findFirst({
        where: { id: targetMemberId, roomId: this.community.roomId },
        select: { id: true, isModerator: true, mutedUntil: true },
      });
      if (!target) throw communityError(404, 'COMMUNITY_MEMBER_NOT_FOUND');
      if (target.isModerator)
        throw communityError(403, 'COMMUNITY_CANNOT_MUTE_MODERATOR');
      const mutedUntil = new Date(
        Math.max(
          Date.now() + body.minutes * 60_000,
          target.mutedUntil?.getTime() ?? 0,
        ),
      );
      await tx.communityMember.update({
        where: { id: target.id },
        data: { mutedUntil },
      });
      const seq = await this.community.nextSequence(tx);
      await tx.communityEvent.create({
        data: {
          roomId: this.community.roomId,
          seq,
          kind: 'MEMBER_MUTED',
          targetMemberId: target.id,
          actorMemberId: actor.id,
          reason: body.reason,
          clientActionId: body.clientActionId,
          requestHash,
          mutedUntil,
        },
      });
      return { memberId: target.id, mutedUntil: mutedUntil.toISOString() };
    });
  }
}
