import { Module } from '@nestjs/common';
import { BooksModule } from '../books/books.module';
import { BookVectorModule } from '../vector/book-vector.module';
import { BookDeletionProcessorService } from './book-deletion-processor.service';
import { BookParserService } from './book-parser.service';
import { BookVectorizationService } from './book-vectorization.service';
import { IngestionJobRepository } from './ingestion-job.repository';
import { IngestionProcessorService } from './ingestion-processor.service';
import { IngestionWorkerService } from './ingestion-worker.service';
import { EpubBookParser } from './parsers/epub-book.parser';
import { TxtBookParser } from './parsers/txt-book.parser';
import { TextChunkerService } from './text-chunker.service';

@Module({
  imports: [BooksModule, BookVectorModule],
  providers: [
    BookParserService,
    TxtBookParser,
    EpubBookParser,
    TextChunkerService,
    BookVectorizationService,
    BookDeletionProcessorService,
    IngestionJobRepository,
    IngestionProcessorService,
    IngestionWorkerService,
  ],
  exports: [BookParserService, TextChunkerService, IngestionJobRepository],
})
export class IngestionModule {}
