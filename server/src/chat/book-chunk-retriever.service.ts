import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BookStatus, BookVisibility, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BookEmbeddingService } from '../vector/book-embedding.service';
import { BookVectorStoreService } from '../vector/book-vector-store.service';
import {
  assertBookRetrievalActive,
  BOOK_BM25_PROFILE,
  BOOK_CORPUS_MAX_BYTES,
  BOOK_CORPUS_MAX_CHUNKS,
  fuseBookRanks,
  scoreVisibleBook,
} from './visible-book-bm25';

export interface BookRetrievalBoundary {
  ownerScope: string;
  bookId: string;
  embeddingVersion: string;
  spoilerCeiling: number;
}

export interface RetrievedBookChunk {
  startOffset?: number | null;
  endOffset?: number | null;
  bookId: string;
  sectionId: string;
  sectionOrder: number;
  sectionTitle: string;
  chunkId: string;
  chunkIndex: number;
  content: string;
  excerpt: string;
  score: number;
}

export interface BookRetrievalRequest {
  embeddingMaxAttempts?: number;
  completeChunksOnly?: boolean;
  strictSectionLimit?: boolean;
  queries: string[];
  limit: number;
  maxContextChars: number;
  maxPerSection: number;
}

@Injectable()
export class BookChunkRetrieverService {
  private readonly logger = new Logger(BookChunkRetrieverService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: BookEmbeddingService,
    private readonly vectorStore: BookVectorStoreService,
  ) {}

  async retrieve(
    boundary: BookRetrievalBoundary,
    request: BookRetrievalRequest,
    signal?: AbortSignal,
  ): Promise<RetrievedBookChunk[]> {
    assertBookRetrievalActive(signal);
    const queries = [...new Set(request.queries.map((query) => query.trim()))]
      .filter(Boolean)
      .slice(0, 3);
    if (queries.length === 0) return [];

    const safeLimit = Math.min(10, Math.max(1, Math.floor(request.limit)));
    const maxContextChars = Math.min(
      12_000,
      Math.max(1_000, Math.floor(request.maxContextChars)),
    );
    const maxPerSection = Math.min(
      safeLimit,
      Math.max(1, Math.floor(request.maxPerSection)),
    );
    const bookWhere = this.bookWhere(boundary);
    const select = {
      id: true,
      bookId: true,
      sectionId: true,
      sectionOrder: true,
      chunkIndex: true,
      content: true,
      startOffset: true,
      endOffset: true,
      section: { select: { title: true } },
    } satisfies Prisma.BookChunkSelect;
    // Read the complete visible corpus from one authorized repeatable snapshot.
    // Query-term prefiltering would compute IDF over the wrong corpus.
    const startedAt = performance.now();
    const chunks = await this.prisma.$transaction(
      async (tx) => {
        if (
          !(await tx.book.findFirst({ where: bookWhere, select: { id: true } }))
        )
          throw new NotFoundException('书籍不存在或当前不可用');
        const corpus: Prisma.BookChunkGetPayload<{ select: typeof select }>[] =
          [];
        let bytes = 0;
        const bookFilter = { ...bookWhere };
        delete bookFilter.id;
        for (;;) {
          assertBookRetrievalActive(signal);
          const page = await tx.bookChunk.findMany({
            where: {
              bookId: boundary.bookId,
              embeddingVersion: boundary.embeddingVersion,
              sectionOrder: { lte: boundary.spoilerCeiling },
              book: bookFilter,
            },
            select,
            orderBy: { id: 'asc' },
            take: 250,
            skip: corpus.length,
          });
          bytes += page.reduce(
            (total, chunk) => total + Buffer.byteLength(chunk.content, 'utf8'),
            0,
          );
          corpus.push(...page);
          if (
            corpus.length > BOOK_CORPUS_MAX_CHUNKS ||
            bytes > BOOK_CORPUS_MAX_BYTES ||
            performance.now() - startedAt > 5_000
          )
            throw new ServiceUnavailableException(
              '当前可见正文超出词法检索预算，请缩小讨论范围',
            );
          if (page.length < 250) return corpus;
        }
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 8_000,
        maxWait: 2_000,
      },
    );
    assertBookRetrievalActive(signal);
    const candidateLimit = Math.min(50, safeLimit * 2);
    const siblingController = new AbortController();
    const retrievalSignal = signal
      ? AbortSignal.any([signal, siblingController.signal])
      : siblingController.signal;
    const [hitGroups, lexicalGroups] = await Promise.all([
      (async () => {
        const vectors = await (request.embeddingMaxAttempts === undefined
          ? this.embeddings.embedBatch(queries, retrievalSignal)
          : this.embeddings.embedBatch(queries, retrievalSignal, {
              maxAttempts: request.embeddingMaxAttempts,
            }));
        assertBookRetrievalActive(retrievalSignal);
        return Promise.all(
          vectors.map((vector) => {
            assertBookRetrievalActive(retrievalSignal);
            return this.vectorStore.searchChunkIds(
              boundary,
              vector,
              boundary.spoilerCeiling,
              candidateLimit,
              ...(request.completeChunksOnly ? [retrievalSignal] : []),
            );
          }),
        );
      })(),
      scoreVisibleBook(chunks, queries, candidateLimit, retrievalSignal),
    ]).catch((error: unknown) => {
      siblingController.abort();
      throw error;
    });
    assertBookRetrievalActive(signal);
    // Revalidate against current state after the potentially slow vector request.
    if (
      !(await this.prisma.book.findFirst({
        where: bookWhere,
        select: { id: true },
      }))
    )
      throw new NotFoundException('书籍状态已变化，请刷新后重试');
    assertBookRetrievalActive(signal);
    const hits = fuseBookRanks(
      this.mergeHits(hitGroups),
      this.mergeHits(lexicalGroups),
    );
    this.logger.debug(
      `Book retrieval profile=${BOOK_BM25_PROFILE}, visibleChunks=${chunks.length}, candidates=${hits.length}, elapsedMs=${Math.round(performance.now() - startedAt)}`,
    );
    const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
    const selected: typeof chunks = [];
    const references: RetrievedBookChunk[] = [];
    const sectionCounts = new Map<string, number>();
    let remainingContextChars = maxContextChars;
    const appendHit = (
      hit: { id: string; score: number },
      enforceSectionLimit: boolean,
    ): void => {
      if (references.length >= safeLimit || remainingContextChars <= 0) {
        return;
      }
      const chunk = byId.get(hit.id);
      if (!chunk || selected.some((item) => item.id === chunk.id)) return;
      if (this.overlapsSelected(chunk, selected)) return;
      if (
        enforceSectionLimit &&
        (sectionCounts.get(chunk.sectionId) ?? 0) >= maxPerSection
      ) {
        return;
      }
      if (
        request.completeChunksOnly &&
        chunk.content.length > remainingContextChars
      )
        return;
      const contextContent = chunk.content.slice(0, remainingContextChars);
      if (!contextContent.trim()) return;
      selected.push(chunk);
      sectionCounts.set(
        chunk.sectionId,
        (sectionCounts.get(chunk.sectionId) ?? 0) + 1,
      );
      references.push({
        ...(request.completeChunksOnly
          ? { startOffset: chunk.startOffset, endOffset: chunk.endOffset }
          : {}),
        bookId: chunk.bookId,
        sectionId: chunk.sectionId,
        sectionOrder: chunk.sectionOrder,
        sectionTitle: chunk.section.title,
        chunkId: chunk.id,
        chunkIndex: chunk.chunkIndex,
        content: contextContent,
        excerpt: chunk.content.slice(0, 600),
        score: hit.score,
      });
      remainingContextChars -= contextContent.length;
    };

    for (const hit of hits) {
      appendHit(hit, true);
      if (references.length >= safeLimit || remainingContextChars <= 0) break;
    }
    if (
      !request.strictSectionLimit &&
      references.length < safeLimit &&
      remainingContextChars > 0
    ) {
      for (const hit of hits) {
        appendHit(hit, false);
        if (references.length >= safeLimit || remainingContextChars <= 0) break;
      }
    }
    return references;
  }

  private bookWhere(boundary: BookRetrievalBoundary): Prisma.BookWhereInput {
    if (
      !Number.isSafeInteger(boundary.spoilerCeiling) ||
      boundary.spoilerCeiling < 1
    )
      throw new Error('Invalid server-derived book boundary');
    return {
      id: boundary.bookId,
      embeddingVersion: boundary.embeddingVersion,
      status: BookStatus.READY,
      ...(boundary.ownerScope === '__system__'
        ? { visibility: BookVisibility.SYSTEM }
        : { visibility: BookVisibility.PRIVATE, ownerId: boundary.ownerScope }),
    };
  }

  private mergeHits(
    hitGroups: Array<Array<{ id: string; score: number }>>,
  ): Array<{ id: string; score: number }> {
    const merged = new Map<
      string,
      { id: string; score: number; rankScore: number; firstSeen: number }
    >();
    let sequence = 0;
    for (const hits of hitGroups) {
      hits.forEach((hit, rank) => {
        const existing = merged.get(hit.id);
        if (existing) {
          existing.rankScore += 1 / (60 + rank + 1);
          existing.score = Math.max(existing.score, hit.score);
          return;
        }
        merged.set(hit.id, {
          id: hit.id,
          score: hit.score,
          rankScore: 1 / (60 + rank + 1),
          firstSeen: sequence,
        });
        sequence += 1;
      });
    }
    return [...merged.values()]
      .sort(
        (a, b) =>
          b.rankScore - a.rankScore ||
          b.score - a.score ||
          a.firstSeen - b.firstSeen,
      )
      .map(({ id, score }) => ({ id, score }));
  }

  private overlapsSelected(
    candidate: {
      sectionId: string;
      startOffset: number | null;
      endOffset: number | null;
    },
    selected: Array<{
      sectionId: string;
      startOffset: number | null;
      endOffset: number | null;
    }>,
  ): boolean {
    if (candidate.startOffset === null || candidate.endOffset === null) {
      return false;
    }
    return selected.some(
      (item) =>
        item.sectionId === candidate.sectionId &&
        item.startOffset !== null &&
        item.endOffset !== null &&
        Math.max(item.startOffset, candidate.startOffset!) <
          Math.min(item.endOffset, candidate.endOffset!),
    );
  }
}
