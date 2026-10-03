import { MailerModule } from '@nestjs-modules/mailer';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
@Module({
  imports: [
    MailerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const user = config.get<string>('SMTP_USER');
        const pass = config.get<string>('SMTP_PASS');
        return {
          transport: {
            host: config.get<string>('SMTP_HOST') || 'smtp.qq.com',
            port: Number(config.get<string>('SMTP_PORT') || 465),
            secure: (config.get<string>('SMTP_SECURE') || 'true') === 'true',
            connectionTimeout: Number(
              config.get<string>('SMTP_CONNECTION_TIMEOUT_MS') || 10_000,
            ),
            greetingTimeout: Number(
              config.get<string>('SMTP_GREETING_TIMEOUT_MS') || 10_000,
            ),
            socketTimeout: Number(
              config.get<string>('SMTP_SOCKET_TIMEOUT_MS') || 20_000,
            ),
            ...(user && pass ? { auth: { user, pass } } : {}),
          },
        };
      },
    }),
  ],
  exports: [MailerModule],
})
export class MailModule {}
