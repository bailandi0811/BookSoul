import { MailerModule } from '@nestjs-modules/mailer';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { ToolsService } from './tools.service';
import { ToolsController } from './tools.controller';

@Module({
  imports: [
    AuthModule,
    MailerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const user = configService.get<string>('SMTP_USER');
        const pass = configService.get<string>('SMTP_PASS');
        return {
          transport: {
            host: configService.get<string>('SMTP_HOST') || 'smtp.qq.com',
            port: Number(configService.get<string>('SMTP_PORT') || 465),
            secure:
              (configService.get<string>('SMTP_SECURE') || 'true') === 'true',
            connectionTimeout: Number(
              configService.get<string>('SMTP_CONNECTION_TIMEOUT_MS') || 10_000,
            ),
            greetingTimeout: Number(
              configService.get<string>('SMTP_GREETING_TIMEOUT_MS') || 10_000,
            ),
            socketTimeout: Number(
              configService.get<string>('SMTP_SOCKET_TIMEOUT_MS') || 20_000,
            ),
            ...(user && pass ? { auth: { user, pass } } : {}),
          },
        };
      },
    }),
  ],
  controllers: [ToolsController],
  providers: [ToolsService],
  exports: [ToolsService],
})
export class ToolsModule {}
