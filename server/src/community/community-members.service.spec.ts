import type { PrismaService } from '../prisma/prisma.service';
import type { ProfileMediaStorage } from '../users/profile/profile-media.storage';
import { CommunityMembersService } from './community-members.service';
import type { CommunityService } from './community.service';

function setup() {
  const member = jest.fn().mockResolvedValue({ id: 'viewer' });
  const findFirst = jest
    .fn()
    .mockResolvedValue({ userId: 'owner', user: { avatarAssetId: 'asset' } });
  const asset = jest
    .fn()
    .mockResolvedValue({ objectKey: 'private-key', storedBytes: 8 });
  const storage = {
    configured: true,
    readBounded: jest.fn().mockResolvedValue(Buffer.from('avatar')),
  };
  const service = new CommunityMembersService(
    {
      communityMember: { findFirst },
      userMediaAsset: { findFirst: asset },
    } as unknown as PrismaService,
    { roomId: 'room', member } as unknown as CommunityService,
    storage as unknown as ProfileMediaStorage,
  );
  return { service, member, findFirst, asset, storage };
}
it('authorizes_viewer_and_requires_target_avatar_consent_before_storage_read', async () => {
  const s = setup();
  s.findFirst.mockResolvedValue(null);
  await expect(
    s.service.avatar('viewer-user', 'public-member', AbortSignal.timeout(1000)),
  ).rejects.toMatchObject({ status: 404 });
  expect(s.member).toHaveBeenCalledWith('viewer-user');
  expect(s.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        id: 'public-member',
        roomId: 'room',
        consentVersion: '2026-10-05',
      },
    }),
  );
  expect(s.storage.readBounded).not.toHaveBeenCalled();
});
it('restricts_current_asset_to_owner_ready_avatar_and_returns_bytes_only', async () => {
  const s = setup();
  const result = await s.service.avatar(
    'viewer-user',
    'public-member',
    AbortSignal.timeout(1000),
  );
  expect(s.asset).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        id: 'asset',
        ownerId: 'owner',
        status: 'READY',
        purpose: 'AVATAR',
      },
    }),
  );
  expect(Buffer.isBuffer(result)).toBe(true);
});
it('nonmember_cannot_probe_avatar_or_member_identity', async () => {
  const s = setup();
  s.member.mockRejectedValue(new Error('no membership'));
  await expect(
    s.service.avatar('outsider', 'member', AbortSignal.timeout(1000)),
  ).rejects.toThrow('no membership');
  expect(s.findFirst).not.toHaveBeenCalled();
});
