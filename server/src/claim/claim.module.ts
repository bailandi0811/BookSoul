import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MilvusModule } from '../milvus/milvus.module';
import { ClaimController } from './claim.controller';
import { ClaimService } from './claim.service';

@Module({
  imports: [AuthModule, MilvusModule],
  controllers: [ClaimController],
  providers: [ClaimService],
})
export class ClaimModule {}
