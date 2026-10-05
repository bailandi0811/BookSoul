import {
  profileFixture,
  PROFILE_OWNER,
} from '../../../test/support/profile-fixture';
import { UserProfileService } from './user-profile.service';

describe('UserProfileService', () => {
  function fixture() {
    const f = profileFixture();
    return { ...f, service: new UserProfileService(f.prisma, f.mediaStorage) };
  }
  it('returns only owned READY wallpapers and hides credentials', async () => {
    const f = fixture();
    const own = f.media();
    f.media('WALLPAPER', 'other');
    f.media().status = 'PENDING';
    const profile = await f.service.getProfile(PROFILE_OWNER);
    expect(profile.wallpapers.map((a) => a.id)).toEqual([own.id]);
    expect(profile.user).not.toHaveProperty('passwordHash');
    expect(profile.wallpaper).toEqual({ mode: 'RANDOM' });
  });
  it('updates trimmed name without changing omitted preference and identity fields', async () => {
    const f = fixture();
    const result = await f.service.updateProfile(PROFILE_OWNER, {
      name: ' New name ',
      expectedRevision: 0,
    });
    expect(result.user.name).toBe('New name');
    expect(result.revision).toBe(1);
    expect(f.user.authVersion).toBe(0);
    expect(f.user.email).toBe('profile@example.invalid');
    expect(result.wallpaper).toEqual({ mode: 'RANDOM' });
  });
  it('rejects stale writes before changing any data', async () => {
    const f = fixture();
    await expect(
      f.service.updateProfile(PROFILE_OWNER, {
        name: 'Changed',
        expectedRevision: 3,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(f.user.name).toBe('Reader');
  });
  it('rejects foreign, unready and wrong-purpose fixed media', async () => {
    const f = fixture();
    const foreign = f.media('WALLPAPER', 'other');
    const avatar = f.media('AVATAR');
    const pending = f.media();
    pending.status = 'PENDING';
    for (const asset of [foreign, avatar, pending]) {
      await expect(
        f.service.updateProfile(PROFILE_OWNER, {
          wallpaper: { mode: 'FIXED', kind: 'USER', id: asset.id },
          expectedRevision: 0,
        }),
      ).rejects.toMatchObject({ status: 404 });
    }
    expect(f.user.profileRevision).toBe(0);
  });
  it('deleting the fixed wallpaper resets selection and retires only that asset', async () => {
    const f = fixture();
    const asset = f.media();
    f.user.wallpaperMode = 'FIXED';
    f.user.fixedWallpaperKind = 'USER';
    f.user.fixedWallpaperId = asset.id;
    const result = await f.service.deleteWallpaper(PROFILE_OWNER, asset.id, 0);
    expect(result.wallpaper).toEqual({ mode: 'RANDOM' });
    expect(result.wallpapers).toHaveLength(0);
    expect(asset.status).toBe('RETIRED');
    expect(result.revision).toBe(1);
  });
  it('can save a name when image signatures are unavailable without erasing assets', async () => {
    const f = fixture();
    const asset = f.media();
    f.storage.signRead.mockRejectedValue(new Error('storage unavailable'));
    const result = await f.service.updateProfile(PROFILE_OWNER, {
      name: 'Saved',
      expectedRevision: 0,
    });
    expect(result.user.name).toBe('Saved');
    expect(result.wallpapers[0]).toMatchObject({ id: asset.id, url: null });
    expect(result.mediaReadError).toBe('MEDIA_STORAGE_UNAVAILABLE');
  });
  it('restores the default avatar and marks the previous resource retired', async () => {
    const f = fixture();
    const avatar = f.media('AVATAR');
    f.user.avatarAssetId = avatar.id;
    expect(
      (
        await f.service.updateProfile(PROFILE_OWNER, {
          resetAvatar: true,
          expectedRevision: 0,
        })
      ).avatar,
    ).toBeNull();
    expect(avatar.status).toBe('RETIRED');
    expect(f.user.avatarAssetId).toBeNull();
  });
});
