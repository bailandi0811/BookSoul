import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import configuration from './config/configuration';
import { MilvusModule } from './milvus/milvus.module';
import { ChatModule } from './chat/chat.module';
import { MemoryModule } from './memory/memory.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ClaimModule } from './claim/claim.module';
import { validateEnvironment } from './config/env.validation';
import { BooksModule } from './books/books.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { ToolsModule } from './tools/tools.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 90,
      },
    ]),
    PrismaModule,
    UsersModule,
    AuthModule,
    ClaimModule,
    BooksModule,
    IngestionModule,
    MilvusModule,
    ChatModule,
    ToolsModule,
    MemoryModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
