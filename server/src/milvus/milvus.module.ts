import { Global, Module } from '@nestjs/common';
import { MilvusService } from './milvus.service';

@Global()
@Module({
  providers: [MilvusService],
  exports: [MilvusService],
})
export class MilvusModule {}
