import { Injectable } from '@nestjs/common';
import {
  BookStatus,
  BookVisibility,
  IngestionJobStatus,
  Prisma,
  ReadingMode,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { defaultBookAssistantName } from '../books/book-assistant.policy';
import type { IngestionErrorCode } from './errors/ingestion-error';
import type { ParsedBook } from './types/parsed-book';
import {
  type ClaimedIngestionJob,
  type ClaimedDeletionJob,
  type BookVectorizationContext,
  IngestionLeaseLostError,
  type PreparedChunk,
  type PreparedSection,
} from './ingestion-job.types';

const CREATE_BATCH_SIZE = 250;

@Injectable()
export class IngestionJobRepository {
  constructor(private readonly prisma: PrismaService) {}

  async recoverStale(staleBefore: Date): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const staleJobs = await tx.ingestionJob.findMany({
        where: {
          status: IngestionJobStatus.RUNNING,
          OR: [
            { heartbeatAt: { lt: staleBefore } },
            { heartbeatAt: null, lockedAt: { lt: staleBefore } },
          ],
        },
        select: { id: true, bookId: true },
      });

      let recovered = 0;
      for (const job of staleJobs) {
        const result = await tx.ingestionJob.updateMany({
          where: {
            id: job.id,
            status: IngestionJobStatus.RUNNING,
            OR: [
              { heartbeatAt: { lt: staleBefore } },
              { heartbeatAt: null, lockedAt: { lt: staleBefore } },
            ],
          },
          data: {
            status: IngestionJobStatus.QUEUED,
            lockedAt: null,
            heartbeatAt: null,
          },
        });
        if (result.count === 0) continue;
        recovered += 1;
        await tx.book.updateMany({
          where: { id: job.bookId, status: { not: BookStatus.DELETING } },
          data: { status: BookStatus.QUEUED, statusProgress: 0 },
        });
      }
      return recovered;
    });
  }

  async claimNext(now = new Date()): Promise<ClaimedIngestionJob | null> {
    return this.prisma.$transaction(async (tx) => {
      const next = await tx.ingestionJob.findFirst({
        where: {
          status: IngestionJobStatus.QUEUED,
          book: { status: { not: BookStatus.DELETING } },
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true, bookId: true },
      });
      if (!next) return null;

      const claimed = await tx.ingestionJob.updateMany({
        where: { id: next.id, status: IngestionJobStatus.QUEUED },
        data: {
          status: IngestionJobStatus.RUNNING,
          attempt: { increment: 1 },
          lockedAt: now,
          heartbeatAt: now,
          lastError: null,
        },
      });
      if (claimed.count === 0) return null;

      const bookUpdated = await tx.book.updateMany({
        where: { id: next.bookId, status: { not: BookStatus.DELETING } },
        data: {
          status: BookStatus.PARSING,
          statusProgress: 5,
          failureCode: null,
          failureMessage: null,
        },
      });
      if (bookUpdated.count === 0) {
        await tx.ingestionJob.update({
          where: { id: next.id },
          data: {
            status: IngestionJobStatus.QUEUED,
            lockedAt: null,
            heartbeatAt: null,
          },
        });
        return null;
      }

      const job = await tx.ingestionJob.findUnique({
        where: { id: next.id },
        include: {
          book: {
            select: {
              storageKey: true,
              originalFileName: true,
              embeddingVersion: true,
            },
          },
        },
      });
      if (!job) return null;
      return {
        jobId: job.id,
        bookId: job.bookId,
        storageKey: job.book.storageKey,
        originalFileName: job.book.originalFileName,
        embeddingVersion: job.book.embeddingVersion,
      };
    });
  }

  async claimNextDeletion(
    retryBefore: Date,
    now = new Date(),
  ): Promise<ClaimedDeletionJob | null> {
    return this.prisma.$transaction(async (tx) => {
      const next = await tx.ingestionJob.findFirst({
        where: {
          book: { status: BookStatus.DELETING },
          OR: [
            { status: IngestionJobStatus.QUEUED },
            {
              status: IngestionJobStatus.FAILED,
              updatedAt: { lt: retryBefore },
            },
          ],
        },
        orderBy: { updatedAt: 'asc' },
        select: {
          id: true,
          bookId: true,
          status: true,
          updatedAt: true,
        },
      });
      if (!next) return null;

      const claimed = await tx.ingestionJob.updateMany({
        where: {
          id: next.id,
          status: next.status,
          updatedAt: next.updatedAt,
        },
        data: {
          status: IngestionJobStatus.RUNNING,
          attempt: { increment: 1 },
          lockedAt: now,
          heartbeatAt: now,
          lastError: null,
        },
      });
      if (claimed.count === 0) return null;

      const job = await tx.ingestionJob.findUnique({
        where: { id: next.id },
        include: {
          book: {
            select: {
              ownerId: true,
              visibility: true,
              storageKey: true,
              status: true,
            },
          },
        },
      });
      if (!job || job.book.status !== BookStatus.DELETING) {
        throw new IngestionLeaseLostError();
      }
      const ownerScope =
        job.book.visibility === BookVisibility.SYSTEM
          ? '__system__'
          : job.book.ownerId;
      if (!ownerScope) {
        throw new Error('Private deleting book is missing its owner');
      }
      return {
        jobId: job.id,
        bookId: job.bookId,
        ownerScope,
        storageKey: job.book.storageKey,
      };
    });
  }

  async markChunking(jobId: string, bookId: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const lease = await tx.ingestionJob.updateMany({
        where: { id: jobId, status: IngestionJobStatus.RUNNING },
        data: { heartbeatAt: now },
      });
      if (lease.count === 0) throw new IngestionLeaseLostError();
      const book = await tx.book.updateMany({
        where: { id: bookId, status: { not: BookStatus.DELETING } },
        data: { status: BookStatus.CHUNKING, statusProgress: 25 },
      });
      if (book.count === 0) throw new IngestionLeaseLostError();
    });
  }

  async completeParsing(input: {
    job: ClaimedIngestionJob;
    parsed: ParsedBook;
    sections: PreparedSection[];
    chunks: PreparedChunk[];
  }): Promise<void> {
    const { job, parsed, sections, chunks } = input;
    await this.prisma.$transaction(
      async (tx) => {
        const activeLease = await tx.ingestionJob.count({
          where: { id: job.jobId, status: IngestionJobStatus.RUNNING },
        });
        if (activeLease === 0) throw new IngestionLeaseLostError();

        await tx.bookSection.deleteMany({ where: { bookId: job.bookId } });
        await this.createInBatches(
          sections.map(
            (section): Prisma.BookSectionCreateManyInput => ({
              ...section,
              bookId: job.bookId,
            }),
          ),
          (data) => tx.bookSection.createMany({ data }),
        );
        await this.createInBatches(
          chunks.map(
            (chunk): Prisma.BookChunkCreateManyInput => ({
              ...chunk,
              bookId: job.bookId,
              embeddingVersion: job.embeddingVersion,
            }),
          ),
          (data) => tx.bookChunk.createMany({ data }),
        );

        const book = await tx.book.updateMany({
          where: {
            id: job.bookId,
            status: { not: BookStatus.DELETING },
          },
          data: {
            title: parsed.title,
            author: parsed.author ?? null,
            language: parsed.language ?? null,
            sectionCount: sections.length,
            chunkCount: chunks.length,
            status: BookStatus.EMBEDDING,
            statusProgress: 30,
            readyAt: null,
            failureCode: null,
            failureMessage: null,
          },
        });
        if (book.count === 0) throw new IngestionLeaseLostError();
        const heartbeat = await tx.ingestionJob.updateMany({
          where: {
            id: job.jobId,
            status: IngestionJobStatus.RUNNING,
          },
          data: {
            heartbeatAt: new Date(),
            lastError: null,
          },
        });
        if (heartbeat.count === 0) throw new IngestionLeaseLostError();
      },
      { maxWait: 5_000, timeout: 60_000 },
    );
  }

  async getVectorizationContext(
    job: ClaimedIngestionJob,
  ): Promise<BookVectorizationContext> {
    const active = await this.prisma.ingestionJob.findFirst({
      where: {
        id: job.jobId,
        bookId: job.bookId,
        status: IngestionJobStatus.RUNNING,
        book: { status: BookStatus.EMBEDDING },
      },
      select: {
        book: {
          select: {
            ownerId: true,
            visibility: true,
            embeddingVersion: true,
            chunkCount: true,
          },
        },
      },
    });
    if (!active) throw new IngestionLeaseLostError();
    const ownerScope =
      active.book.visibility === BookVisibility.SYSTEM
        ? '__system__'
        : active.book.ownerId;
    if (!ownerScope) throw new Error('Private book is missing its owner');

    const totalChunks = await this.prisma.bookChunk.count({
      where: {
        bookId: job.bookId,
        embeddingVersion: active.book.embeddingVersion,
      },
    });
    if (totalChunks !== active.book.chunkCount || totalChunks === 0) {
      throw new Error('Persisted book chunk count is inconsistent');
    }
    return {
      ownerScope,
      bookId: job.bookId,
      embeddingVersion: active.book.embeddingVersion,
      totalChunks,
    };
  }

  listVectorChunks(
    context: BookVectorizationContext,
    offset: number,
    take: number,
  ) {
    return this.prisma.bookChunk.findMany({
      where: {
        bookId: context.bookId,
        embeddingVersion: context.embeddingVersion,
      },
      orderBy: [{ sectionOrder: 'asc' }, { chunkIndex: 'asc' }, { id: 'asc' }],
      skip: offset,
      take,
      select: {
        id: true,
        sectionId: true,
        sectionOrder: true,
        chunkIndex: true,
        content: true,
      },
    });
  }

  async assertEmbeddingLease(job: ClaimedIngestionJob): Promise<void> {
    const active = await this.prisma.ingestionJob.count({
      where: {
        id: job.jobId,
        bookId: job.bookId,
        status: IngestionJobStatus.RUNNING,
        book: { status: BookStatus.EMBEDDING },
      },
    });
    if (active === 0) throw new IngestionLeaseLostError();
  }

  async updateEmbeddingProgress(
    job: ClaimedIngestionJob,
    completed: number,
    total: number,
  ): Promise<void> {
    const progress = Math.min(95, 30 + Math.floor((completed / total) * 65));
    await this.prisma.$transaction(async (tx) => {
      const lease = await tx.ingestionJob.updateMany({
        where: { id: job.jobId, status: IngestionJobStatus.RUNNING },
        data: { heartbeatAt: new Date() },
      });
      if (lease.count === 0) throw new IngestionLeaseLostError();
      const book = await tx.book.updateMany({
        where: { id: job.bookId, status: BookStatus.EMBEDDING },
        data: { statusProgress: progress },
      });
      if (book.count === 0) throw new IngestionLeaseLostError();
    });
  }

  async completeEmbedding(job: ClaimedIngestionJob): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const activeBook = await tx.book.findFirst({
        where: { id: job.bookId, status: BookStatus.EMBEDDING },
        select: {
          ownerId: true,
          visibility: true,
          title: true,
        },
      });
      if (!activeBook) throw new IngestionLeaseLostError();
      if (
        activeBook.visibility === BookVisibility.PRIVATE &&
        !activeBook.ownerId
      ) {
        throw new Error('Private book is missing its owner');
      }
      const book = await tx.book.updateMany({
        where: { id: job.bookId, status: BookStatus.EMBEDDING },
        data: {
          status: BookStatus.READY,
          statusProgress: 100,
          readyAt: new Date(),
          failureCode: null,
          failureMessage: null,
        },
      });
      if (book.count === 0) throw new IngestionLeaseLostError();
      if (activeBook.ownerId) {
        await tx.bookAssistant.upsert({
          where: {
            ownerId_bookId: {
              ownerId: activeBook.ownerId,
              bookId: job.bookId,
            },
          },
          create: {
            ownerId: activeBook.ownerId,
            bookId: job.bookId,
            name: defaultBookAssistantName(activeBook.title),
          },
          update: {},
        });
        await tx.readingProgress.upsert({
          where: {
            ownerId_bookId: {
              ownerId: activeBook.ownerId,
              bookId: job.bookId,
            },
          },
          create: {
            ownerId: activeBook.ownerId,
            bookId: job.bookId,
            mode: ReadingMode.NOT_STARTED,
          },
          update: {},
        });
      }
      const completed = await tx.ingestionJob.updateMany({
        where: { id: job.jobId, status: IngestionJobStatus.RUNNING },
        data: {
          status: IngestionJobStatus.SUCCEEDED,
          lockedAt: null,
          heartbeatAt: new Date(),
          lastError: null,
        },
      });
      if (completed.count === 0) throw new IngestionLeaseLostError();
    });
  }

  async completeDeletion(job: ClaimedDeletionJob): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const active = await tx.ingestionJob.count({
        where: { id: job.jobId, status: IngestionJobStatus.RUNNING },
      });
      if (active === 0) throw new IngestionLeaseLostError();
      const deleted = await tx.book.deleteMany({
        where: { id: job.bookId, status: BookStatus.DELETING },
      });
      if (deleted.count === 0) throw new IngestionLeaseLostError();
    });
  }

  async failDeletion(job: ClaimedDeletionJob): Promise<void> {
    await this.prisma.ingestionJob.updateMany({
      where: { id: job.jobId, status: IngestionJobStatus.RUNNING },
      data: {
        status: IngestionJobStatus.FAILED,
        lockedAt: null,
        heartbeatAt: new Date(),
        lastError: 'DELETE_CLEANUP_FAILED',
      },
    });
  }

  async fail(
    job: ClaimedIngestionJob,
    code: IngestionErrorCode,
    safeMessage: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const failed = await tx.ingestionJob.updateMany({
        where: { id: job.jobId, status: IngestionJobStatus.RUNNING },
        data: {
          status: IngestionJobStatus.FAILED,
          lockedAt: null,
          heartbeatAt: new Date(),
          lastError: code,
        },
      });
      if (failed.count === 0) return;
      await tx.book.updateMany({
        where: { id: job.bookId, status: { not: BookStatus.DELETING } },
        data: {
          status: BookStatus.FAILED,
          statusProgress: 0,
          failureCode: code,
          failureMessage: safeMessage,
        },
      });
    });
  }

  private async createInBatches<T>(
    rows: T[],
    create: (batch: T[]) => Promise<unknown>,
  ): Promise<void> {
    for (let offset = 0; offset < rows.length; offset += CREATE_BATCH_SIZE) {
      await create(rows.slice(offset, offset + CREATE_BATCH_SIZE));
    }
  }
}
