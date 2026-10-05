import { UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { UserProfileController } from './user-profile.controller';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateMediaUploadDto } from './dto/create-media-upload.dto';
import type { UserProfileService } from './user-profile.service';
import type { ProfileMediaService } from './profile-media.service';

describe('UserProfileController boundary', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  it('rejects client-supplied owners and missing or invalid versions through actual validation', async () => {
    for (const input of [
      { name: 'Reader', expectedRevision: 0, userId: 'someone' },
      { name: 'Reader' },
      { name: null, expectedRevision: 0 },
      { expectedRevision: -1, wallpaper: {} },
    ]) {
      await expect(
        pipe.transform(input, { type: 'body', metatype: UpdateProfileDto }),
      ).rejects.toMatchObject({ status: 400 });
    }
    await expect(
      pipe.transform(
        { purpose: 'BOOK', contentType: 'image/png', byteSize: 1 },
        { type: 'body', metatype: CreateMediaUploadDto },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('takes ownership from trusted authentication and requires the JWT guard', async () => {
    const profile = {
      getProfile: jest.fn().mockResolvedValue({ revision: 0 }),
    };
    const controller = new UserProfileController(
      profile as unknown as UserProfileService,
      {} as ProfileMediaService,
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, UserProfileController),
    ).toContain(JwtAuthGuard);
    expect(
      await controller.getProfile({
        kind: 'user',
        userId: 'trusted',
        email: 'fixture@example.invalid',
        name: 'Reader',
      }),
    ).toEqual({ success: true, data: { revision: 0 } });
    expect(profile.getProfile).toHaveBeenCalledWith('trusted');
    expect(() =>
      controller.getProfile({ kind: 'guest', userId: 'guest_fixture' }),
    ).toThrow(UnauthorizedException);
  });
});
