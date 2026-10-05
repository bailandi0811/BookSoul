import { Injectable } from '@nestjs/common';
import type { UserMediaAsset } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProfileMediaStorage } from './profile-media.storage';

@Injectable()
export class ProfileMediaCleanupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ProfileMediaStorage,
  ) {}

  async cleanup({
    dryRun,
    limit,
  }: {
    dryRun: boolean;
    limit: number;
  }): Promise<{ eligible: number; deleted: number; failed: number }> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new Error('Cleanup limit must be between 1 and 100');
    const now = new Date();
    const cutoff = new Date(now.getTime() - 86400000);
    const candidates = await this.prisma.userMediaAsset.findMany({
      where: {
        OR: [
          { status: 'PENDING', commitExpiresAt: { lt: cutoff } },
          { status: 'REJECTED', updatedAt: { lt: cutoff } },
          { status: 'RETIRED', retiredAt: { lt: cutoff } },
          {
            status: 'READY',
            stagingCleanedAt: null,
            uploadExpiresAt: { lt: now },
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    const result = { eligible: 0, deleted: 0, failed: 0 };
    for (const candidate of candidates) {
      const current = await this.prisma.userMediaAsset.findFirst({
        where: {
          id: candidate.id,
          ownerId: candidate.ownerId,
          status: candidate.status,
        },
      });
      if (!current || !this.eligible(current, now)) continue;
      const owner = await this.prisma.user.findUnique({
        where: { id: current.ownerId },
        select: {
          avatarAssetId: true,
          fixedWallpaperKind: true,
          fixedWallpaperId: true,
        },
      });
      if (
        current.status !== 'READY' &&
        owner &&
        (owner.avatarAssetId === current.id ||
          (owner.fixedWallpaperKind === 'USER' &&
            owner.fixedWallpaperId === current.id))
      )
        continue;
      result.eligible++;
      try {
        this.assertKeys(current);
        if (dryRun) continue;
        await this.storage.delete(current.uploadKey);
        if (current.status !== 'READY')
          await this.storage.delete(current.objectKey);
        await this.prisma.userMediaAsset.updateMany({
          where: {
            id: current.id,
            ownerId: current.ownerId,
            status: current.status,
          },
          data:
            current.status === 'READY'
              ? { stagingCleanedAt: now }
              : { status: 'DELETED', stagingCleanedAt: now },
        });
        result.deleted++;
      } catch {
        result.failed++;
      }
    }
    return result;
  }

  private eligible(asset: UserMediaAsset, now: Date): boolean {
    const cutoff = now.getTime() - 86400000;
    if (asset.status === 'PENDING')
      return asset.commitExpiresAt.getTime() < cutoff;
    if (asset.status === 'REJECTED') return asset.updatedAt.getTime() < cutoff;
    if (asset.status === 'RETIRED')
      return !!asset.retiredAt && asset.retiredAt.getTime() < cutoff;
    return (
      asset.status === 'READY' &&
      !asset.stagingCleanedAt &&
      asset.uploadExpiresAt.getTime() < now.getTime()
    );
  }
  private assertKeys(asset: UserMediaAsset): void {
    if (!/^[a-z0-9-]+$/i.test(asset.ownerId) || !/^[a-z0-9-]+$/i.test(asset.id))
      throw new Error('Invalid media identifier');
    const prefix = `booksoul/profile/staging/${asset.ownerId}/${asset.id}.`;
    if (
      !asset.uploadKey.startsWith(prefix) ||
      !['png', 'jpg', 'webp'].includes(asset.uploadKey.slice(prefix.length)) ||
      asset.objectKey !==
        `booksoul/profile/assets/${asset.ownerId}/${asset.purpose}/${asset.id}.webp`
    )
      throw new Error('Object outside profile media scope');
  }
}
