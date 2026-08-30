import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookEmbeddingService } from '../vector/book-embedding.service';
import { BookVectorStoreService } from '../vector/book-vector-store.service';

export interface BookRetrievalBoundary {
  ownerScope: string;
  bookId: string;
  embeddingVersion: string;
  spoilerCeiling: number;
}

export interface RetrievedBookChunk {
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
  queries: string[];
  limit: number;
  maxContextChars: number;
  maxPerSection: number;
}

@Injectable()
export class BookChunkRetrieverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: BookEmbeddingService,
    private readonly vectorStore: BookVectorStoreService,
  ) {}

  async retrieve(
    boundary: BookRetrievalBoundary,
    request: BookRetrievalRequest,
  ): Promise<RetrievedBookChunk[]> {
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
    const vectors = await this.embeddings.embedBatch(queries);
    const hitGroups = await Promise.all(
      vectors.map((vector) =>
        this.vectorStore.searchChunkIds(
          boundary,
          vector,
          boundary.spoilerCeiling,
          Math.min(50, safeLimit * 2),
        ),
      ),
    );
    const hits = this.mergeHits(hitGroups);
    const uniqueIds = [...new Set(hits.map((hit) => hit.id))];
    if (uniqueIds.length === 0) return [];

    const chunks = await this.prisma.bookChunk.findMany({
      where: {
        id: { in: uniqueIds },
        bookId: boundary.bookId,
        embeddingVersion: boundary.embeddingVersion,
        sectionOrder: { lte: boundary.spoilerCeiling },
      },
      select: {
        id: true,
        bookId: true,
        sectionId: true,
        sectionOrder: true,
        chunkIndex: true,
        content: true,
        startOffset: true,
        endOffset: true,
        section: { select: { title: true } },
      },
    });
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
      const contextContent = chunk.content.slice(0, remainingContextChars);
      if (!contextContent.trim()) return;
      selected.push(chunk);
      sectionCounts.set(
        chunk.sectionId,
        (sectionCounts.get(chunk.sectionId) ?? 0) + 1,
      );
      references.push({
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
    if (references.length < safeLimit && remainingContextChars > 0) {
      for (const hit of hits) {
        appendHit(hit, false);
        if (references.length >= safeLimit || remainingContextChars <= 0) break;
      }
    }
    return references;
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
