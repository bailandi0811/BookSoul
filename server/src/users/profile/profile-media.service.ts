import {
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { lockAuthUser } from '../../auth/auth-user-lock';
import { ProfileMediaStorage } from './profile-media.storage';
import { ProfileImageService } from './profile-image.service';
import { UserProfileService } from './user-profile.service';
import { assertMediaInput, profileError } from './profile.policy';
import type {
  ProfileSnapshot,
  UploadTicket,
  ValidMediaInput,
} from './profile.types';

const WALLPAPER_LIMIT = 4;

@Injectable()
export class ProfileMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profile: UserProfileService,
    private readonly storage: ProfileMediaStorage,
    private readonly images: ProfileImageService,
  ) {}

  async createUpload(
    ownerId: string,
    input: ValidMediaInput,
  ): Promise<UploadTicket> {
    input = assertMediaInput(input.purpose, input.contentType, input.byteSize);
    this.assertStorage();
    const now = new Date();
    const asset = await this.prisma.$transaction(async (tx) => {
      if (!(await lockAuthUser(tx, ownerId))) throw new UnauthorizedException();
      const minute = await tx.userMediaAsset.count({
        where: { ownerId, createdAt: { gte: new Date(now.getTime() - 60000) } },
      });
      const day = await tx.userMediaAsset.count({
        where: {
          ownerId,
          createdAt: { gte: new Date(now.getTime() - 86400000) },
        },
      });
      if (minute >= 10 || day >= 30)
        profileError(429, 'MEDIA_RATE_LIMITED', '上传次数较多，请稍后重试');
      const pending = {
        status: 'PENDING' as const,
        commitExpiresAt: { gt: now },
      };
      const count = await tx.userMediaAsset.count({
        where: {
          ownerId,
          purpose: input.purpose,
          OR:
            input.purpose === 'WALLPAPER'
              ? [{ status: 'READY' }, pending]
              : [pending],
        },
      });
      if (count >= (input.purpose === 'WALLPAPER' ? WALLPAPER_LIMIT : 3))
        profileError(
          429,
          input.purpose === 'WALLPAPER'
            ? 'WALLPAPER_LIMIT_REACHED'
            : 'MEDIA_RATE_LIMITED',
          '请先移除旧壁纸或等待在途上传完成',
        );
      const id = randomUUID();
      return tx.userMediaAsset.create({
        data: {
          id,
          ownerId,
          purpose: input.purpose,
          uploadKey: `booksoul/profile/staging/${ownerId}/${id}.${input.extension}`,
          objectKey: `booksoul/profile/assets/${ownerId}/${input.purpose}/${id}.webp`,
          declaredMime: input.contentType,
          declaredBytes: input.byteSize,
          uploadExpiresAt: new Date(now.getTime() + 300000),
          commitExpiresAt: new Date(now.getTime() + 1800000),
        },
      });
    });
    const upload = await this.storage.createUpload(
      asset.uploadKey,
      asset.declaredMime,
      asset.declaredBytes,
      asset.uploadExpiresAt,
    );
    return {
      assetId: asset.id,
      uploadExpiresAt: asset.uploadExpiresAt.toISOString(),
      commitExpiresAt: asset.commitExpiresAt.toISOString(),
      upload,
    };
  }

  async commit(
    ownerId: string,
    assetId: string,
    expectedRevision: number,
    parentSignal?: AbortSignal,
  ): Promise<{ profile: ProfileSnapshot; alreadyCommitted: boolean }> {
    const signal = AbortSignal.any([
      AbortSignal.timeout(60000),
      ...(parentSignal ? [parentSignal] : []),
    ]);
    const asset = await this.prisma.userMediaAsset.findFirst({
      where: { id: assetId, ownerId },
    });
    if (!asset) profileError(404, 'MEDIA_NOT_FOUND', '图片不存在');
    if (asset.status === 'READY' || asset.status === 'RETIRED')
      return {
        profile: await this.profile.getProfile(ownerId),
        alreadyCommitted: true,
      };
    if (
      asset.status !== 'PENDING' ||
      asset.commitExpiresAt.getTime() <= Date.now()
    )
      profileError(410, 'MEDIA_UPLOAD_EXPIRED', '上传已过期，请重新选择图片');
    this.assertStorage();
    try {
      signal.throwIfAborted();
      const meta = await this.storage.head(asset.uploadKey);
      signal.throwIfAborted();
      if (!meta)
        profileError(409, 'MEDIA_NOT_UPLOADED', '图片尚未上传完成，请重新上传');
      const maxBytes = (asset.purpose === 'AVATAR' ? 5 : 10) * 1024 ** 2;
      if (meta.byteSize > maxBytes)
        profileError(413, 'MEDIA_TOO_LARGE', '图片超过允许大小');
      if (
        meta.byteSize !== asset.declaredBytes ||
        meta.contentType.split(';')[0].trim().toLowerCase() !==
          asset.declaredMime
      )
        profileError(
          422,
          'MEDIA_INVALID_IMAGE',
          '图片类型或大小与上传声明不一致',
        );
      const source = await this.storage.readBounded(
        asset.uploadKey,
        asset.declaredBytes,
        signal,
      );
      if (source.length !== asset.declaredBytes)
        profileError(422, 'MEDIA_INVALID_IMAGE', '图片内容不完整');
      const normalized = await this.images.normalizeImage(
        source,
        asset.purpose,
        signal,
      );
      if (normalized.contentType !== asset.declaredMime)
        profileError(
          422,
          'MEDIA_INVALID_IMAGE',
          '图片真实格式与上传声明不一致',
        );
      signal.throwIfAborted();
      await this.storage.putPrivate(
        asset.objectKey,
        normalized.bytes,
        'image/webp',
        signal,
      );
      signal.throwIfAborted();
      const alreadyCommitted = await this.prisma.$transaction(async (tx) => {
        const user = await lockAuthUser(tx, ownerId);
        if (!user) throw new UnauthorizedException();
        const current = await tx.userMediaAsset.findFirst({
          where: { id: assetId, ownerId },
        });
        if (!current) profileError(404, 'MEDIA_NOT_FOUND', '图片不存在');
        if (current.status === 'READY' || current.status === 'RETIRED')
          return true;
        if (
          current.status !== 'PENDING' ||
          current.commitExpiresAt.getTime() <= Date.now()
        )
          profileError(410, 'MEDIA_UPLOAD_EXPIRED', '上传已过期');
        if (user.profileRevision !== expectedRevision)
          profileError(
            409,
            'PROFILE_REVISION_CONFLICT',
            '资料已更新，请重新加载后保存',
          );
        signal.throwIfAborted();
        await tx.userMediaAsset.update({
          where: { id: assetId },
          data: {
            status: 'READY',
            width: normalized.width,
            height: normalized.height,
            storedBytes: normalized.bytes.length,
          },
        });
        signal.throwIfAborted();
        if (asset.purpose === 'AVATAR' && user.avatarAssetId)
          await tx.userMediaAsset.updateMany({
            where: {
              id: user.avatarAssetId,
              ownerId,
              purpose: 'AVATAR',
              status: 'READY',
            },
            data: { status: 'RETIRED', retiredAt: new Date() },
          });
        signal.throwIfAborted();
        await tx.user.update({
          where: { id: ownerId },
          data: {
            profileRevision: { increment: 1 },
            ...(asset.purpose === 'AVATAR' ? { avatarAssetId: assetId } : {}),
          },
        });
        signal.throwIfAborted();
        return false;
      });
      return {
        profile: await this.profile.getProfile(ownerId),
        alreadyCommitted,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        if ([413, 422].includes(error.getStatus()))
          await this.prisma.userMediaAsset.updateMany({
            where: { id: assetId, ownerId, status: 'PENDING' },
            data: { status: 'REJECTED' },
          });
        throw error;
      }
      return profileError(
        503,
        'MEDIA_STORAGE_UNAVAILABLE',
        '图片存储或处理暂不可用，请稍后重试',
      );
    }
  }

  private assertStorage(): void {
    if (!this.storage.configured)
      profileError(503, 'MEDIA_STORAGE_UNAVAILABLE', '图片上传尚未配置');
  }
}
