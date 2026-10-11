import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { BookFileStorageService } from './book-file-storage.service';
import { BookAssistantPromptService } from './book-assistant-prompt.service';
import { BookAssistantsController } from './book-assistants.controller';
import { BookAssistantsService } from './book-assistants.service';
import { BookReadingController } from './book-reading.controller';
import { BookReadingService } from './book-reading.service';
import { BookReaderService } from './book-reader.service';
import { BookReaderController } from './book-reader.controller';
import { BookReaderPositionService } from './book-reader-position.service';
import { BooksController } from './books.controller';
import { BooksService } from './books.service';
import { SystemBookMigrationService } from './system-book-migration.service';
import { BookObjectStorageService } from './book-object-storage.service';
import { BookUploadsService } from './book-uploads.service';
import { BookUploadsController } from './book-uploads.controller';
import { BookUploadCleanupService } from './book-upload-cleanup.service';
import { LegacyBookUploadLimitInterceptor } from './legacy-book-upload-limit.interceptor';

@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        limits: {
          files: 1,
          fileSize:
            configService.get<number>('books.maxUploadBytes') ||
            50 * 1024 * 1024,
        },
      }),
    }),
  ],
  controllers: [
    BookUploadsController,
    BooksController,
    BookAssistantsController,
    BookReadingController,
    BookReaderController,
  ],
  providers: [
    BookObjectStorageService,
    BookUploadsService,
    BookUploadCleanupService,
    LegacyBookUploadLimitInterceptor,
    BooksService,
    BookFileStorageService,
    BookAssistantsService,
    BookAssistantPromptService,
    BookReadingService,
    BookReaderService,
    BookReaderPositionService,
    SystemBookMigrationService,
  ],
  exports: [
    BooksService,
    BookFileStorageService,
    BookAssistantsService,
    BookAssistantPromptService,
    BookReadingService,
    SystemBookMigrationService,
  ],
})
export class BooksModule {}
