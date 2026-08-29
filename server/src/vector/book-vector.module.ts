import { Module } from '@nestjs/common';
import { BookEmbeddingService } from './book-embedding.service';
import { BookVectorStoreService } from './book-vector-store.service';

@Module({
  providers: [BookEmbeddingService, BookVectorStoreService],
  exports: [BookEmbeddingService, BookVectorStoreService],
})
export class BookVectorModule {}
