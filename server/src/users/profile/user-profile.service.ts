import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Prisma, User, UserMediaAsset } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { lockAuthUser } from '../../auth/auth-user-lock';
import { toPublicUser } from '../users.service';
import { ProfileMediaStorage } from './profile-media.storage';
import {
  assertWallpaperSelection,
  normalizeProfileName,
  profileError,
} from './profile.policy';
import type {
  ProfileSnapshot,
  ReadableMedia,
  WallpaperSelection,
} from './profile.types';
import type { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UserProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ProfileMediaStorage,
  ) {}

  async getProfile(ownerId: string): Promise<ProfileSnapshot> {
    const { user, assets } = await this.prisma.$transaction(
      async (tx) => {
        const user = await tx.user.findUnique({ where: { id: ownerId } });
        if (!user) throw new UnauthorizedException();
        const assets = await tx.userMediaAsset.findMany({
          where: { ownerId, status: 'READY' },
          orderBy: { createdAt: 'asc' },
        });
        return { user, assets };
      },
      { isolationLevel: 'RepeatableRead' },
    );
    let mediaReadError: ProfileSnapshot['mediaReadError'] = null;
    const readable = async (asset: UserMediaAsset): Promise<ReadableMedia> => {
      let url: string | null = null;
      let expiresAt: string | null = null;
      try {
        url = await this.storage.signRead(asset.objectKey, 900);
        expiresAt = new Date(Date.now() + 900000).toISOString();
      } catch {
        mediaReadError = 'MEDIA_STORAGE_UNAVAILABLE';
      }
      return {
        id: asset.id,
        width: asset.width!,
        height: asset.height!,
        url,
        expiresAt,
      };
    };
    const avatar = assets.find(
      (a) => a.id === user.avatarAssetId && a.purpose === 'AVATAR',
    );
    const wallpapers = await Promise.all(
      assets.filter((a) => a.purpose === 'WALLPAPER').map(readable),
    );
    const avatarMedia = avatar ? await readable(avatar) : null;
    return {
      user: toPublicUser(user),
      revision: user.profileRevision,
      avatar: avatarMedia,
      wallpapers,
      wallpaper: this.selection(user),
      mediaUploadsAvailable: this.storage.configured,
      mediaReadError,
    };
  }

  async updateProfile(
    ownerId: string,
    dto: UpdateProfileDto,
  ): Promise<ProfileSnapshot> {
    const name =
      dto.name === undefined ? undefined : normalizeProfileName(dto.name);
    const wallpaper =
      dto.wallpaper === undefined
        ? undefined
        : assertWallpaperSelection(dto.wallpaper);
    if (name === undefined && !wallpaper && dto.resetAvatar !== true)
      profileError(400, 'PROFILE_INPUT_INVALID', '请选择需要保存的资料');
    await this.prisma.$transaction(async (tx) => {
      const user = await this.lockCurrent(tx, ownerId, dto.expectedRevision);
      const data: Prisma.UserUncheckedUpdateInput = {};
      if (name !== undefined && name !== user.name) data.name = name;
      if (wallpaper) {
        if (wallpaper.mode === 'FIXED' && wallpaper.kind === 'USER') {
          const asset = await tx.userMediaAsset.findFirst({
            where: {
              id: wallpaper.id,
              ownerId,
              purpose: 'WALLPAPER',
              status: 'READY',
            },
          });
          if (!asset) profileError(404, 'MEDIA_NOT_FOUND', '图片不存在');
        }
        if (
          JSON.stringify(wallpaper) !== JSON.stringify(this.selection(user))
        ) {
          data.wallpaperMode = wallpaper.mode;
          data.fixedWallpaperKind =
            wallpaper.mode === 'FIXED' ? wallpaper.kind : null;
          data.fixedWallpaperId =
            wallpaper.mode === 'FIXED' ? wallpaper.id : null;
        }
      }
      if (dto.resetAvatar && user.avatarAssetId) {
        data.avatarAssetId = null;
        await tx.userMediaAsset.updateMany({
          where: {
            id: user.avatarAssetId,
            ownerId,
            purpose: 'AVATAR',
            status: 'READY',
          },
          data: { status: 'RETIRED', retiredAt: new Date() },
        });
      }
      if (Object.keys(data).length) {
        data.profileRevision = { increment: 1 };
        await tx.user.update({ where: { id: ownerId }, data });
      }
    });
    return this.getProfile(ownerId);
  }

  async deleteWallpaper(
    ownerId: string,
    assetId: string,
    expectedRevision: number,
  ): Promise<ProfileSnapshot> {
    await this.prisma.$transaction(async (tx) => {
      const user = await this.lockCurrent(tx, ownerId, expectedRevision);
      const asset = await tx.userMediaAsset.findFirst({
        where: { id: assetId, ownerId, purpose: 'WALLPAPER', status: 'READY' },
      });
      if (!asset) profileError(404, 'MEDIA_NOT_FOUND', '图片不存在');
      await tx.userMediaAsset.update({
        where: { id: asset.id },
        data: { status: 'RETIRED', retiredAt: new Date() },
      });
      const data: Prisma.UserUncheckedUpdateInput = {
        profileRevision: { increment: 1 },
      };
      if (
        user.fixedWallpaperKind === 'USER' &&
        user.fixedWallpaperId === assetId
      ) {
        Object.assign(data, {
          wallpaperMode: 'RANDOM',
          fixedWallpaperKind: null,
          fixedWallpaperId: null,
        });
      }
      await tx.user.update({ where: { id: ownerId }, data });
    });
    return this.getProfile(ownerId);
  }

  async lockCurrent(
    tx: Prisma.TransactionClient,
    ownerId: string,
    revision: number,
  ): Promise<User> {
    const user = await lockAuthUser(tx, ownerId);
    if (!user) throw new UnauthorizedException();
    if (!Number.isSafeInteger(revision) || revision < 0)
      profileError(400, 'PROFILE_INPUT_INVALID', '版本不合法');
    if (user.profileRevision !== revision)
      profileError(
        409,
        'PROFILE_REVISION_CONFLICT',
        '资料已在其他窗口更新，请重新加载后保存',
      );
    return user;
  }

  private selection(user: User): WallpaperSelection {
    if (
      user.wallpaperMode === 'FIXED' &&
      user.fixedWallpaperKind &&
      user.fixedWallpaperId
    )
      return {
        mode: 'FIXED',
        kind: user.fixedWallpaperKind,
        id: user.fixedWallpaperId,
      };
    return { mode: 'RANDOM' };
  }
}
