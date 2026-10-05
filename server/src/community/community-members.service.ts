import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileMediaStorage } from '../users/profile/profile-media.storage';
import { CommunityService } from './community.service';
import { AVATAR_CONSENT_VERSION, communityError } from './community.policy';

@Injectable()
export class CommunityMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly community: CommunityService,
    private readonly storage: ProfileMediaStorage,
  ) {}

  async search(userId: string, query: string) {
    await this.community.member(userId);
    const members = await this.prisma.communityMember.findMany({
      where: {
        roomId: this.community.roomId,
        user: { name: { contains: query, mode: 'insensitive' } },
      },
      orderBy: [{ user: { name: 'asc' } }, { id: 'asc' }],
      take: 20,
      select: {
        id: true,
        consentVersion: true,
        userId: true,
        user: {
          select: {
            name: true,
            profileRevision: true,
            avatarAsset: {
              select: { ownerId: true, status: true, purpose: true },
            },
          },
        },
      },
    });
    return members.map((m) => ({
      memberId: m.id,
      name: m.user.name,
      avatarRevision:
        m.consentVersion === AVATAR_CONSENT_VERSION &&
        m.user.avatarAsset?.status === 'READY' &&
        m.user.avatarAsset.purpose === 'AVATAR' &&
        m.user.avatarAsset.ownerId === m.userId
          ? String(m.user.profileRevision)
          : null,
    }));
  }

  async avatar(
    userId: string,
    memberId: string,
    signal: AbortSignal,
  ): Promise<Buffer> {
    await this.community.member(userId);
    const member = await this.prisma.communityMember.findFirst({
      where: {
        id: memberId,
        roomId: this.community.roomId,
        consentVersion: AVATAR_CONSENT_VERSION,
      },
      select: { userId: true, user: { select: { avatarAssetId: true } } },
    });
    if (!member?.user.avatarAssetId)
      throw communityError(404, 'COMMUNITY_AVATAR_UNAVAILABLE');
    const asset = await this.prisma.userMediaAsset.findFirst({
      where: {
        id: member.user.avatarAssetId,
        ownerId: member.userId,
        status: 'READY',
        purpose: 'AVATAR',
      },
      select: { objectKey: true, storedBytes: true },
    });
    if (!asset || !this.storage.configured)
      throw communityError(404, 'COMMUNITY_AVATAR_UNAVAILABLE');
    const bytes = await this.storage.readBounded(
      asset.objectKey,
      Math.min(asset.storedBytes ?? 5 * 1024 ** 2, 5 * 1024 ** 2),
      signal,
    );
    signal.throwIfAborted();
    // Recheck the current pointer/lifecycle after IO: retired avatar bytes must not be served.
    const current = await this.prisma.communityMember.findFirst({
      where: {
        id: memberId,
        roomId: this.community.roomId,
        consentVersion: AVATAR_CONSENT_VERSION,
        user: {
          avatarAssetId: member.user.avatarAssetId,
          avatarAsset: {
            ownerId: member.userId,
            status: 'READY',
            purpose: 'AVATAR',
          },
        },
      },
      select: { id: true },
    });
    if (!current) throw communityError(404, 'COMMUNITY_AVATAR_UNAVAILABLE');
    return bytes;
  }
}
