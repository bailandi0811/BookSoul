import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { resolveIsolatedDatabaseUrl } from '../prisma/testing/isolated-database';
import { PrismaService } from '../prisma/prisma.service';
import { IngestionJobRepository } from '../ingestion/ingestion-job.repository';
import { IngestionLeaseLostError } from '../ingestion/ingestion-job.types';
import { BookUploadsService } from './book-uploads.service';
import { BookObjectStorageService } from './book-object-storage.service';
import { BooksService } from './books.service';

describe('upload admission in an explicitly isolated PostgreSQL database', () => {
  const ownerId = randomUUID();
  const bookIds = [randomUUID(), randomUUID()];
  let db: PrismaClient | undefined;
  beforeAll(async () => {
    const url = resolveIsolatedDatabaseUrl(process.env);
    db = new PrismaClient({ datasources: { db: { url } } });
    // Admission scans the queue; refuse a schema containing unrelated books.
    if ((await db.book.count()) !== 0)
      throw new Error(
        'Upload concurrency tests require an empty dedicated test schema; no existing data will be cleared.',
      );
    await db.user.create({
      data: {
        id: ownerId,
        email: `upload-${ownerId}@example.invalid`,
        name: 'Synthetic reader',
        passwordHash: 'synthetic-fixture',
      },
    });
    for (const id of bookIds)
      await db.book.create({
        data: {
          id,
          ownerId,
          title: '合成小说',
          originalFileName: 'fixture.txt',
          storageKey: `fixture-${id}`,
          mimeType: 'text/plain',
          fileSizeBytes: 12,
          contentHash: id,
          parserVersion: 'fixture',
          embeddingVersion: 'fixture',
          ingestionJob: { create: {} },
        },
      });
  });
  afterAll(async () => {
    if (!db) return;
    await db.bookUploadSession.deleteMany({ where: { ownerId } });
    await db.book.deleteMany({ where: { id: { in: bookIds }, ownerId } });
    await db.user.deleteMany({
      where: { id: ownerId, email: `upload-${ownerId}@example.invalid` },
    });
    await db.$disconnect();
  });
  it('reserves at most two uploads across racing API instances', async () => {
    const objects = {
      configured: true,
      head: () => Promise.resolve(null),
      postTicket: () => ({
        method: 'POST',
        url: 'https://fixture.invalid',
        fields: {},
      }),
    } as unknown as BookObjectStorageService;
    const service = new BookUploadsService(
      db as unknown as PrismaService,
      objects,
      {} as BooksService,
      { get: () => undefined } as unknown as ConfigService,
    );
    const results = await Promise.allSettled(
      Array.from({ length: 3 }, () =>
        service.create(ownerId, {
          requestId: randomUUID(),
          fileName: 'fixture.txt',
          byteSize: 12,
          sha256: 'a'.repeat(64),
        }),
      ),
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(2);
    expect(
      await db!.bookUploadSession.count({
        where: { ownerId, status: 'UPLOADING' },
      }),
    ).toBe(2);
  });
  it('claims at most one book per owner and rejects a superseded executor', async () => {
    const repositories = [
      new IngestionJobRepository(db as unknown as PrismaService),
      new IngestionJobRepository(db as unknown as PrismaService),
    ];
    const jobs = await Promise.all(
      repositories.map((repository) => repository.claimNext()),
    );
    expect(jobs.filter(Boolean)).toHaveLength(1);
    const job = jobs.find((value) => value !== null)!;
    // Only mutate the synthetic job created by this test.
    expect(bookIds).toContain(job.bookId);
    await db!.ingestionJob.updateMany({
      where: {
        id: job.jobId,
        bookId: { in: bookIds },
        leaseToken: job.leaseToken,
      },
      data: { leaseToken: randomUUID() },
    });
    await expect(repositories[0].markChunking(job)).rejects.toBeInstanceOf(
      IngestionLeaseLostError,
    );
  });
});
