import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { BooksModule } from '../books/books.module';
import { SystemBookMigrationService } from '../books/system-book-migration.service';
import configuration from '../config/configuration';
import { validateEnvironment } from '../config/env.validation';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
      validate: validateEnvironment,
    }),
    PrismaModule,
    BooksModule,
  ],
})
class PrivateReaderMigrationCliModule {}

async function main() {
  const app = await NestFactory.createApplicationContext(
    PrivateReaderMigrationCliModule,
    { logger: ['error', 'warn'] },
  );
  try {
    const migration = app.get(SystemBookMigrationService);
    if (process.argv.includes('--backfill-only')) {
      const result = await migration.backfillLegacyTianlongSessions();
      console.log(JSON.stringify({ phase: 'backfill', ...result }));
      return;
    }
    const sourcePath =
      process.argv.slice(2).find((argument) => !argument.startsWith('--')) ??
      '../天龙八部.epub';
    const result = await migration.seedTianlong(sourcePath);
    console.log(
      JSON.stringify({
        phase: 'seed',
        bookId: result.id,
        status: result.status,
        created: result.created,
      }),
    );
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
