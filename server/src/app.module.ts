import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import configuration from './config/configuration';
import { MilvusModule } from './milvus/milvus.module';
import { McpModule } from './mcp/mcp.module';
import { RagModule } from './rag/rag.module';
import { ChatModule } from './chat/chat.module';
import { ToolsModule } from './tools/tools.module';
import { PersonaModule } from './persona/persona.module';
import { MemoryModule } from './memory/memory.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ClaimModule } from './claim/claim.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
    }),
    MailerModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        transport: {
          host: configService.get('SMTP_HOST') || 'smtp.qq.com',
          port: Number(configService.get('SMTP_PORT') || 465),
          secure: (configService.get('SMTP_SECURE') || 'true') === 'true',
          auth: {
            user: configService.get('SMTP_USER'),
            pass: configService.get('SMTP_PASS'),
          },
        },
        defaults: {
          from:
            configService.get('SMTP_FROM') ||
            `"BookSoul Agent" <${configService.get('SMTP_USER')}>`,
        },
      }),
      inject: [ConfigService],
    }),
    PrismaModule,
    UsersModule,
    AuthModule,
    ClaimModule,
    MilvusModule,
    McpModule,
    RagModule,
    ChatModule,
    ToolsModule,
    PersonaModule,
    MemoryModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
