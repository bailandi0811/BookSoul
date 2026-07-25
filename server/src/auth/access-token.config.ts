import { ConfigService } from '@nestjs/config';

export function getAccessTokenSecret(configService: ConfigService): string {
  const secret = configService.get<string>('auth.accessSecret');

  if (!secret) {
    throw new Error(
      'JWT_ACCESS_SECRET is required. Configure a strong, private signing secret.',
    );
  }

  return secret;
}
