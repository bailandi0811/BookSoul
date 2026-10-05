import {
  profileFixture,
  PROFILE_OWNER,
} from '../../../test/support/profile-fixture';
import { UserProfileService } from './user-profile.service';
import { ProfileMediaService } from './profile-media.service';
import type { ProfileImageService } from './profile-image.service';

describe('ProfileMediaService', () => {
  function fixture() {
    const f = profileFixture();
    const profile = new UserProfileService(f.prisma, f.mediaStorage);
    const image = {
      normalizeImage: jest.fn().mockResolvedValue({
        bytes: Buffer.from('normalized'),
        width: 512,
        height: 512,
        contentType: 'image/png',
      }),
    };
    return {
      ...f,
      image,
      service: new ProfileMediaService(
        f.prisma,
        profile,
        f.mediaStorage,
        image as unknown as ProfileImageService,
      ),
    };
  }
  it('creates a scoped, expiring upload ticket without changing profile revision', async () => {
    const f = fixture();
    const ticket = await f.service.createUpload(PROFILE_OWNER, {
      purpose: 'AVATAR',
      contentType: 'image/png',
      byteSize: 50,
      extension: 'png',
    });
    expect(f.assets[0].uploadKey).toBe(
      `booksoul/profile/staging/${PROFILE_OWNER}/${ticket.assetId}.png`,
    );
    expect(
      new Date(ticket.commitExpiresAt).getTime() -
        new Date(ticket.uploadExpiresAt).getTime(),
    ).toBe(1500000);
    expect(f.user.profileRevision).toBe(0);
  });
  it('rejects persistent upload rate or gallery limits', async () => {
    const f = fixture();
    f.tx.userMediaAsset.count.mockResolvedValue(30);
    await expect(
      f.service.createUpload(PROFILE_OWNER, {
        purpose: 'WALLPAPER',
        contentType: 'image/png',
        byteSize: 50,
        extension: 'png',
      }),
    ).rejects.toMatchObject({ status: 429 });
    expect(f.assets).toHaveLength(0);
  });
  it('confirms an avatar once, preserving the new avatar when old commits repeat', async () => {
    const f = fixture();
    const old = f.media('AVATAR');
    const asset = f.media('AVATAR');
    asset.status = 'PENDING';
    f.user.avatarAssetId = old.id;
    f.storage.head.mockResolvedValue({
      byteSize: 50,
      contentType: 'image/png',
    });
    f.storage.readBounded.mockResolvedValue(Buffer.alloc(50));
    const result = await f.service.commit(PROFILE_OWNER, asset.id, 0);
    expect(result.alreadyCommitted).toBe(false);
    expect(f.user.avatarAssetId).toBe(asset.id);
    expect(old.status).toBe('RETIRED');
    expect(
      (await f.service.commit(PROFILE_OWNER, old.id, 0)).alreadyCommitted,
    ).toBe(true);
    expect(
      (await f.service.commit(PROFILE_OWNER, asset.id, 0)).alreadyCommitted,
    ).toBe(true);
    expect(f.user.profileRevision).toBe(1);
    expect(f.user.avatarAssetId).toBe(asset.id);
  });
  it('rejects foreign resources before reading objects', async () => {
    const f = fixture();
    const asset = f.media('AVATAR', 'foreign');
    asset.status = 'PENDING';
    await expect(
      f.service.commit(PROFILE_OWNER, asset.id, 0),
    ).rejects.toMatchObject({ status: 404 });
    expect(f.storage.head).not.toHaveBeenCalled();
  });
  it('rejects missing, expired, oversized and spoofed objects without changing avatar', async () => {
    const cases = [
      { meta: null, status: 409 },
      { meta: { byteSize: 5242881, contentType: 'image/png' }, status: 413 },
      { meta: { byteSize: 50, contentType: 'image/jpeg' }, status: 422 },
    ];
    for (const input of cases) {
      const f = fixture();
      const asset = f.media('AVATAR');
      asset.status = 'PENDING';
      f.storage.head.mockResolvedValue(input.meta);
      await expect(
        f.service.commit(PROFILE_OWNER, asset.id, 0),
      ).rejects.toMatchObject({ status: input.status });
      expect(f.user.avatarAssetId).toBeNull();
    }
    const f = fixture();
    const asset = f.media('AVATAR');
    asset.status = 'PENDING';
    asset.commitExpiresAt = new Date(0);
    await expect(
      f.service.commit(PROFILE_OWNER, asset.id, 0),
    ).rejects.toMatchObject({ status: 410 });
  });
  it('checks decoded content type before writing the normalized object', async () => {
    const f = fixture();
    const asset = f.media('AVATAR');
    asset.status = 'PENDING';
    f.storage.head.mockResolvedValue({
      byteSize: 50,
      contentType: 'image/png',
    });
    f.storage.readBounded.mockResolvedValue(Buffer.alloc(50));
    f.image.normalizeImage.mockResolvedValue({
      bytes: Buffer.from('out'),
      width: 512,
      height: 512,
      contentType: 'image/jpeg',
    });
    await expect(
      f.service.commit(PROFILE_OWNER, asset.id, 0),
    ).rejects.toMatchObject({ status: 422 });
    expect(f.storage.putPrivate).not.toHaveBeenCalled();
    expect(asset.status).toBe('REJECTED');
  });
  it('keeps a trackable pending object when the final transaction cannot start', async () => {
    const f = fixture();
    const asset = f.media('AVATAR');
    asset.status = 'PENDING';
    f.storage.head.mockResolvedValue({
      byteSize: 50,
      contentType: 'image/png',
    });
    f.storage.readBounded.mockResolvedValue(Buffer.alloc(50));
    f.prisma.$transaction = jest
      .fn()
      .mockRejectedValue(new Error('fixture failure'));
    await expect(
      f.service.commit(PROFILE_OWNER, asset.id, 0),
    ).rejects.toMatchObject({ status: 503 });
    expect(f.storage.putPrivate).toHaveBeenCalledWith(
      asset.objectKey,
      Buffer.from('normalized'),
      'image/webp',
      expect.any(AbortSignal),
    );
    expect(asset.status).toBe('PENDING');
    expect(f.user.avatarAssetId).toBeNull();
    expect(f.user.profileRevision).toBe(0);
  });
  it('rejects cancellation during each final transaction write', async () => {
    for (const during of ['asset', 'user'] as const) {
      const f = fixture();
      const controller = new AbortController();
      const asset = f.media('AVATAR');
      asset.status = 'PENDING';
      f.storage.head.mockResolvedValue({
        byteSize: 50,
        contentType: 'image/png',
      });
      f.storage.readBounded.mockResolvedValue(Buffer.alloc(50));
      if (during === 'asset') {
        f.tx.userMediaAsset.update.mockImplementationOnce(async () => {
          controller.abort();
          return asset;
        });
      } else {
        f.tx.user.update.mockImplementationOnce(async () => {
          controller.abort();
          return f.user;
        });
      }
      await expect(
        f.service.commit(PROFILE_OWNER, asset.id, 0, controller.signal),
      ).rejects.toMatchObject({ status: 503 });
      if (during === 'asset') expect(f.tx.user.update).not.toHaveBeenCalled();
    }
  });
  it('does not change the selected wallpaper mode when adding an image', async () => {
    const f = fixture();
    const asset = f.media();
    asset.status = 'PENDING';
    f.user.wallpaperMode = 'FIXED';
    f.user.fixedWallpaperKind = 'SYSTEM';
    f.user.fixedWallpaperId = 'city';
    f.storage.head.mockResolvedValue({
      byteSize: 50,
      contentType: 'image/png',
    });
    f.storage.readBounded.mockResolvedValue(Buffer.alloc(50));
    const result = await f.service.commit(PROFILE_OWNER, asset.id, 0);
    expect(result.profile.wallpaper).toEqual({
      mode: 'FIXED',
      kind: 'SYSTEM',
      id: 'city',
    });
    expect(result.profile.wallpapers[0].id).toBe(asset.id);
  });
  it('does not overwrite a newer profile update after external image processing', async () => {
    const f = fixture();
    const asset = f.media('AVATAR');
    asset.status = 'PENDING';
    f.storage.head.mockResolvedValue({
      byteSize: 50,
      contentType: 'image/png',
    });
    f.storage.readBounded.mockResolvedValue(Buffer.alloc(50));
    f.image.normalizeImage.mockImplementation(async () => {
      f.user.profileRevision = 1;
      return {
        bytes: Buffer.from('out'),
        width: 512,
        height: 512,
        contentType: 'image/png',
      };
    });
    await expect(
      f.service.commit(PROFILE_OWNER, asset.id, 0),
    ).rejects.toMatchObject({ status: 409 });
    expect(asset.status).toBe('PENDING');
    expect(f.user.avatarAssetId).toBeNull();
  });
});
