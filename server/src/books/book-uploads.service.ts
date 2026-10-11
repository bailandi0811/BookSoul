import {
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BookUploadSession } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { lockAuthUser } from '../auth/auth-user-lock';
import { PrismaService } from '../prisma/prisma.service';
import { BookObjectStorageService } from './book-object-storage.service';
import { BooksService } from './books.service';
import { assertBookStorageQuota } from './book-storage-quota';
import {
  assertUploadInput,
  BOOK_COMMIT_LEASE_MS,
  BOOK_MULTIPART_THRESHOLD,
  BOOK_PART_BYTES,
  BOOK_UPLOAD_TTL_MS,
  BOOK_UPLOADS_PER_USER,
  uploadError,
  validateParts,
  type BookUploadTicket,
  type CreateBookUploadInput,
} from './book-upload.policy';

@Injectable()
export class BookUploadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly objects: BookObjectStorageService,
    private readonly books: BooksService,
    private readonly config: ConfigService,
  ) {}

  async create(
    ownerId: string,
    input: CreateBookUploadInput,
  ): Promise<BookUploadTicket> {
    assertUploadInput(input);
    this.requireStorage();
    const now = new Date();
    const session = await this.prisma.$transaction(async (tx) => {
      if (!(await lockAuthUser(tx, ownerId))) throw new UnauthorizedException();
      const previous = await tx.bookUploadSession.findUnique({
        where: { ownerId_requestId: { ownerId, requestId: input.requestId } },
      });
      if (previous) {
        if (
          previous.declaredHash !== input.sha256 ||
          previous.declaredBytes !== input.byteSize ||
          previous.originalFileName !== input.fileName
        )
          uploadError(409, 'BOOK_UPLOAD_CONFLICT', '上传会话与所选文件不匹配');
        return previous;
      }
      const active = await assertBookStorageQuota(tx, ownerId, input.byteSize);
      if (active.length >= BOOK_UPLOADS_PER_USER)
        uploadError(
          429,
          'BOOK_UPLOAD_LIMIT',
          '最多同时上传两本书，请先完成或取消其他上传',
        );
      const id = randomUUID();
      const extension = /\.epub$/i.test(input.fileName) ? 'epub' : 'txt';
      return tx.bookUploadSession.create({
        data: {
          id,
          ownerId,
          requestId: input.requestId,
          originalFileName: input.fileName,
          declaredBytes: input.byteSize,
          declaredHash: input.sha256,
          mimeType:
            extension === 'epub' ? 'application/epub+zip' : 'text/plain',
          stagingKey: `booksoul/books/staging/${id}/source.${extension}`,
          partSize:
            input.byteSize >= BOOK_MULTIPART_THRESHOLD ? BOOK_PART_BYTES : null,
          expiresAt: new Date(now.getTime() + BOOK_UPLOAD_TTL_MS),
        },
      });
    });
    return this.ticket(session);
  }

  async get(ownerId: string, id: string): Promise<BookUploadTicket> {
    return this.ticket(await this.owned(ownerId, id));
  }

  async list(ownerId: string) {
    const sessions = await this.prisma.bookUploadSession.findMany({
      where: {
        ownerId,
        status: { in: ['UPLOADING', 'FINALIZING'] },
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      take: BOOK_UPLOADS_PER_USER,
    });
    return sessions.map((session) => ({
      id: session.id,
      fileName: session.originalFileName,
      byteSize: session.declaredBytes,
      status: session.status,
      expiresAt: session.expiresAt.toISOString(),
    }));
  }

  async commit(ownerId: string, id: string) {
    const session = await this.owned(ownerId, id);
    if (session.status === 'COMMITTED')
      return this.books.getById(ownerId, session.bookId!);
    this.requireStorage();
    this.assertActive(session);
    const now = new Date();
    const token = randomUUID();
    const extension = session.mimeType === 'text/plain' ? 'txt' : 'epub';
    const candidate = `booksoul/books/sources/${token}/source.${extension}`;
    const claim = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(71420261012::bigint)::text`;
      if (
        (await tx.bookUploadSession.count({
          where: { status: 'FINALIZING', leaseExpiresAt: { gt: now } },
        })) >= 4
      )
        uploadError(
          429,
          'BOOK_CONFIRM_LIMIT',
          '正在确认的文件较多，请稍后重试确认',
        );
      return tx.bookUploadSession.updateMany({
        where: {
          id,
          ownerId,
          expiresAt: { gt: now },
          OR: [
            { status: 'UPLOADING' },
            { status: 'FINALIZING', leaseExpiresAt: { lt: now } },
          ],
        },
        data: {
          status: 'FINALIZING',
          leaseToken: token,
          leaseExpiresAt: new Date(now.getTime() + BOOK_COMMIT_LEASE_MS),
          cleanupKeys: { push: candidate },
        },
      });
    });
    if (!claim.count)
      uploadError(409, 'BOOK_UPLOAD_BUSY', '文件正在确认，请稍后重试确认');
    try {
      let meta = await this.objects.head(session.stagingKey);
      if (!meta && session.partSize) {
        if (!session.multipartId)
          uploadError(409, 'BOOK_UPLOAD_INCOMPLETE', '文件尚未上传完成');
        const parts = await this.objects.parts(
          session.stagingKey,
          session.multipartId,
        );
        validateParts(parts, session.declaredBytes, session.partSize);
        await this.objects.complete(
          session.stagingKey,
          session.multipartId,
          parts,
        );
        meta = await this.objects.head(session.stagingKey);
      }
      if (!meta)
        uploadError(
          409,
          'BOOK_UPLOAD_INCOMPLETE',
          '文件尚未上传完成，请重新选择原文件继续上传',
        );
      if (meta.size !== session.declaredBytes)
        uploadError(
          422,
          'BOOK_UPLOAD_SIZE_MISMATCH',
          '文件实际大小与声明不一致',
        );
      await this.objects.snapshot(session.stagingKey, candidate, meta.etag);
      const bookId = await this.objects.withFile(candidate, async (file) => {
        if (
          file.size !== session.declaredBytes ||
          file.sha256 !== session.declaredHash
        )
          uploadError(
            422,
            'BOOK_UPLOAD_HASH_MISMATCH',
            '文件校验失败，请重新选择原文件上传',
          );
        const source = this.books.describeSource(
          session.originalFileName,
          file.size,
          file.prefix,
          file.sha256,
        );
        return this.prisma.$transaction(async (tx) => {
          if (!(await lockAuthUser(tx, ownerId)))
            throw new UnauthorizedException();
          // Lock the session before creating any business records. A reclaimed request cannot commit.
          const lease = await tx.bookUploadSession.updateMany({
            where: {
              id,
              ownerId,
              status: 'FINALIZING',
              leaseToken: token,
              leaseExpiresAt: { gt: new Date() },
            },
            data: {
              leaseExpiresAt: new Date(Date.now() + BOOK_COMMIT_LEASE_MS),
            },
          });
          if (!lease.count)
            uploadError(409, 'BOOK_UPLOAD_BUSY', '确认已失效，请重新确认');
          const duplicate = await tx.book.findFirst({
            where: { ownerId, contentHash: file.sha256 },
            select: { id: true, status: true },
          });
          if (duplicate?.status === 'DELETING')
            uploadError(
              409,
              'BOOK_DELETE_PENDING',
              '同一文件正在删除，请等待删除完成后重试',
            );
          if (!duplicate)
            await assertBookStorageQuota(tx, ownerId, file.size, id);
          const book =
            duplicate ??
            (await tx.book.create({
              data: {
                ownerId,
                visibility: 'PRIVATE',
                title: source.title,
                originalFileName: source.originalFileName,
                storageKey: `oss:${candidate}`,
                mimeType: source.canonicalMimeType,
                fileSizeBytes: BigInt(source.size),
                contentHash: file.sha256,
                parserVersion:
                  this.config.get<string>('books.parserVersion') ||
                  'book-parser-v1',
                embeddingVersion:
                  this.config.get<string>('books.embeddingVersion') ||
                  'book-embedding-v1',
                status: 'QUEUED',
                ingestionJob: { create: {} },
              },
              select: { id: true },
            }));
          const current = await tx.bookUploadSession.findUniqueOrThrow({
            where: { id },
          });
          await tx.bookUploadSession.update({
            where: { id },
            data: {
              status: 'COMMITTED',
              bookId: book.id,
              leaseToken: null,
              leaseExpiresAt: null,
              cleanupKeys: duplicate
                ? current.cleanupKeys
                : current.cleanupKeys.filter((key) => key !== candidate),
            },
          });
          return book.id;
        });
      });
      return this.books.getById(ownerId, bookId);
    } catch (error) {
      // Keep candidate keys durably recorded for cleanup; ambiguous commits must not delete a live source.
      const permanent =
        error instanceof HttpException &&
        [400, 413, 422].includes(error.getStatus());
      await this.prisma.bookUploadSession.updateMany({
        where: { id, ownerId, status: 'FINALIZING', leaseToken: token },
        data: {
          status: permanent ? 'CANCELLED' : 'UPLOADING',
          leaseToken: null,
          leaseExpiresAt: null,
        },
      });
      throw error;
    }
  }

  async cancel(ownerId: string, id: string): Promise<void> {
    const session = await this.owned(ownerId, id);
    if (session.status === 'COMMITTED')
      uploadError(409, 'BOOK_UPLOAD_COMMITTED', '书籍已经入库，请通过书库删除');
    const result = await this.prisma.bookUploadSession.updateMany({
      where: {
        id,
        ownerId,
        OR: [
          { status: { in: ['UPLOADING', 'CANCELLED', 'EXPIRED'] } },
          { status: 'FINALIZING', leaseExpiresAt: { lt: new Date() } },
        ],
      },
      data: { status: 'CANCELLED', leaseToken: null, leaseExpiresAt: null },
    });
    if (!result.count)
      uploadError(409, 'BOOK_UPLOAD_BUSY', '文件正在确认，请稍后重试');
  }

  async cleanupExpired(): Promise<number> {
    if (!this.objects.configured) return 0;
    // Wait out all five-minute upload signatures and bounded confirmation operations.
    const cutoff = new Date(Date.now() - 10 * 60_000);
    const sessions = await this.prisma.bookUploadSession.findMany({
      where: {
        cleanedAt: null,
        updatedAt: { lt: cutoff },
        OR: [
          { status: { in: ['COMMITTED', 'CANCELLED', 'EXPIRED'] } },
          { expiresAt: { lt: cutoff } },
        ],
      },
      take: 20,
      orderBy: { updatedAt: 'asc' },
    });
    let cleaned = 0;
    for (const session of sessions) {
      const claimed = await this.prisma.bookUploadSession.updateMany({
        where: {
          id: session.id,
          updatedAt: session.updatedAt,
          cleanedAt: null,
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: cutoff } }],
        },
        data: {
          status: session.status === 'COMMITTED' ? 'COMMITTED' : 'EXPIRED',
        },
      });
      if (!claimed.count) continue;
      if (session.multipartId)
        await this.objects.abort(session.stagingKey, session.multipartId);
      await this.objects.delete(session.stagingKey);
      for (const key of session.cleanupKeys) await this.objects.delete(key);
      await this.prisma.bookUploadSession.updateMany({
        where: { id: session.id, status: { in: ['COMMITTED', 'EXPIRED'] } },
        data: { cleanedAt: new Date(), cleanupKeys: [] },
      });
      cleaned++;
    }
    return cleaned;
  }

  private async ticket(session: BookUploadSession): Promise<BookUploadTicket> {
    if (session.status === 'COMMITTED') {
      const existing =
        session.bookId &&
        (await this.prisma.book.findFirst({
          where: {
            id: session.bookId,
            ownerId: session.ownerId,
            status: { not: 'DELETING' },
          },
          select: { id: true },
        }));
      if (!existing)
        uploadError(410, 'BOOK_UPLOAD_EXPIRED', '原书籍已删除，请重新上传');
    }
    if (session.status !== 'COMMITTED') this.assertActive(session);
    const base: BookUploadTicket = {
      id: session.id,
      status: session.status,
      expiresAt: session.expiresAt.toISOString(),
      byteSize: session.declaredBytes,
      sha256: session.declaredHash,
      partSize: session.partSize,
      uploadedParts: [],
      upload: null,
      parts: [],
      bookId: session.bookId,
    };
    if (session.status === 'COMMITTED' || session.status === 'FINALIZING')
      return base;
    this.requireStorage();
    if (!session.partSize) {
      if (await this.objects.head(session.stagingKey)) return base;
      return {
        ...base,
        upload: this.objects.postTicket(
          session.stagingKey,
          session.mimeType,
          session.declaredBytes,
        ),
      };
    }
    // User lock prevents two GET/create requests leaking separate multipart upload IDs.
    if (!session.multipartId) {
      session = await this.prisma.$transaction(
        async (tx) => {
          if (!(await lockAuthUser(tx, session.ownerId)))
            throw new UnauthorizedException();
          const current = await tx.bookUploadSession.findFirstOrThrow({
            where: { id: session.id, ownerId: session.ownerId },
          });
          this.assertActive(current);
          if (current.status !== 'UPLOADING') return current;
          if (current.multipartId) return current;
          const multipartId = await this.objects.initialize(
            current.stagingKey,
            current.mimeType,
          );
          return tx.bookUploadSession.update({
            where: { id: current.id },
            data: { multipartId },
          });
        },
        { timeout: 15_000 },
      );
    }
    if (session.status !== 'UPLOADING')
      return { ...base, status: session.status };
    if (await this.objects.head(session.stagingKey)) return base;
    const parts = await this.objects.parts(
      session.stagingKey,
      session.multipartId!,
    );
    const count = Math.ceil(session.declaredBytes / session.partSize!);
    const uploadedParts = parts
      .filter(
        (part) =>
          part.number >= 1 &&
          part.number <= count &&
          part.size ===
            Math.min(
              session.partSize!,
              session.declaredBytes - (part.number - 1) * session.partSize!,
            ),
      )
      .map((part) => part.number);
    return {
      ...base,
      uploadedParts,
      parts: await Promise.all(
        Array.from({ length: count }, (_, index) => index + 1)
          .filter((number) => !uploadedParts.includes(number))
          .map(async (number) => ({
            number,
            url: await this.objects.partUrl(
              session.stagingKey,
              session.multipartId!,
              number,
              Math.min(
                session.partSize!,
                session.declaredBytes - (number - 1) * session.partSize!,
              ),
            ),
          })),
      ),
    };
  }

  private async owned(ownerId: string, id: string): Promise<BookUploadSession> {
    const session = await this.prisma.bookUploadSession.findFirst({
      where: { id, ownerId },
    });
    if (!session) uploadError(404, 'BOOK_UPLOAD_NOT_FOUND', '上传任务不存在');
    return session;
  }
  private assertActive(session: BookUploadSession): void {
    if (
      !['UPLOADING', 'FINALIZING'].includes(session.status) ||
      session.expiresAt.getTime() <= Date.now()
    )
      uploadError(410, 'BOOK_UPLOAD_EXPIRED', '上传已过期或取消，请重新上传');
  }
  private requireStorage(): void {
    if (!this.objects.configured)
      uploadError(
        503,
        'BOOK_STORAGE_UNAVAILABLE',
        '小说直传尚未配置，请联系管理员',
      );
  }
}
