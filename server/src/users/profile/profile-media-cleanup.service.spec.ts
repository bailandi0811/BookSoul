import { profileFixture } from '../../../test/support/profile-fixture';
import { ProfileMediaCleanupService } from './profile-media-cleanup.service';

describe('profile media cleanup', () => {
  it('reports eligible expired resources without deleting anything by default', async () => {
    const f = profileFixture();
    const asset = f.media();
    asset.status = 'PENDING';
    asset.commitExpiresAt = new Date(0);
    const cleanup = new ProfileMediaCleanupService(f.prisma, f.mediaStorage);
    expect(await cleanup.cleanup({ dryRun: true, limit: 100 })).toEqual({
      eligible: 1,
      deleted: 0,
      failed: 0,
    });
    expect(asset.status).toBe('PENDING');
    expect(f.storage.delete).not.toHaveBeenCalled();
  });
  it('preserves READY formal objects and active referenced assets', async () => {
    const f = profileFixture();
    const ready = f.media();
    ready.uploadExpiresAt = new Date(0);
    const active = f.media('AVATAR');
    active.status = 'RETIRED';
    active.retiredAt = new Date(0);
    f.user.avatarAssetId = active.id;
    const cleanup = new ProfileMediaCleanupService(f.prisma, f.mediaStorage);
    const result = await cleanup.cleanup({ dryRun: false, limit: 100 });
    expect(result.deleted).toBe(1);
    expect(ready.status).toBe('READY');
    expect(f.storage.delete.mock.calls.map(([key]) => key)).toEqual([
      ready.uploadKey,
    ]);
    expect(active.status).toBe('RETIRED');
  });
  it('retains failures for retry and never deletes recently pending or out-of-scope keys', async () => {
    const f = profileFixture();
    const old = f.media();
    old.status = 'PENDING';
    old.commitExpiresAt = new Date(0);
    const recent = f.media();
    recent.status = 'PENDING';
    const invalid = f.media();
    invalid.status = 'RETIRED';
    invalid.retiredAt = new Date(0);
    invalid.objectKey = 'unrelated/object';
    f.storage.delete.mockRejectedValue(new Error('temporary fault'));
    const cleanup = new ProfileMediaCleanupService(f.prisma, f.mediaStorage);
    const result = await cleanup.cleanup({ dryRun: false, limit: 100 });
    expect(result.failed).toBe(2);
    expect(old.status).toBe('PENDING');
    expect(recent.status).toBe('PENDING');
    expect(f.storage.delete).not.toHaveBeenCalledWith(invalid.objectKey);
  });
});
