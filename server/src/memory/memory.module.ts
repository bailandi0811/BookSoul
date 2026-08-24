import { Module } from '@nestjs/common';
import { MemoryService } from './memory.service';
import { MemoryController } from './memory.controller';
import { UserProfileRepository } from './repositories/user-profile.repository';
import { MemoryEntryRepository } from './repositories/memory-entry.repository';
import { ImportanceScorerStrategy } from './strategies/importance-scorer.strategy';
import { MilvusModule } from '../milvus/milvus.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [MilvusModule, AuthModule],
  controllers: [MemoryController],
  providers: [
    MemoryService,
    UserProfileRepository,
    MemoryEntryRepository,
    ImportanceScorerStrategy,
  ],
  exports: [MemoryService],
})
export class MemoryModule {}
