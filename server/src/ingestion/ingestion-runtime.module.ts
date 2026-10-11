import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from '../config/configuration';
import { validateEnvironment } from '../config/env.validation';
import { PrismaModule } from '../prisma/prisma.module';
import { MilvusModule } from '../milvus/milvus.module';
import { IngestionModule } from './ingestion.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnvironment,
    }),
    PrismaModule,
    MilvusModule,
    IngestionModule,
  ],
})
export class IngestionRuntimeModule {}
