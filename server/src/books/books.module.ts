import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { BookFileStorageService } from './book-file-storage.service';
import { BookAssistantPromptService } from './book-assistant-prompt.service';
import { BookAssistantsController } from './book-assistants.controller';
import { BookAssistantsService } from './book-assistants.service';
import { BookReadingController } from './book-reading.controller';
import { BookReadingService } from './book-reading.service';
import { BooksController } from './books.controller';
import { BooksService } from './books.service';
import { SystemBookMigrationService } from './system-book-migration.service';

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
    BooksController,
    BookAssistantsController,
    BookReadingController,
  ],
  providers: [
    BooksService,
    BookFileStorageService,
    BookAssistantsService,
    BookAssistantPromptService,
    BookReadingService,
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
