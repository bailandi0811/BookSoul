import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../../auth/auth.module';
import { UsersModule } from '../users.module';
import { parseProfileMediaConfig } from '../../config/profile-media.config';
import { ProfileMediaStorage } from './profile-media.storage';
import { OssProfileMediaStorage } from './oss-profile-media.storage';
import { UnconfiguredProfileMediaStorage } from './unconfigured-profile-media.storage';
import { ProfileImageService } from './profile-image.service';
import { ProfileMediaService } from './profile-media.service';
import { UserProfileService } from './user-profile.service';
import { UserProfileController } from './user-profile.controller';

@Module({
  exports: [ProfileMediaStorage],
  imports: [UsersModule, AuthModule],
  controllers: [UserProfileController],
  providers: [
    {
      provide: ProfileMediaStorage,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const values: Record<string, unknown> = {};
        for (const key of [
          'OSS_REGION',
          'OSS_BUCKET',
          'OSS_ACCESS_KEY_ID',
          'OSS_ACCESS_KEY_SECRET',
          'OSS_ENDPOINT',
        ])
          values[key] = config.get<unknown>(key);
        const media = parseProfileMediaConfig(values);
        return media
          ? new OssProfileMediaStorage(media)
          : new UnconfiguredProfileMediaStorage();
      },
    },
    ProfileImageService,
    ProfileMediaService,
    UserProfileService,
  ],
})
export class UserProfileModule {}
