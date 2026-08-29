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

@Injectable()
export class BookChunkRetrieverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: BookEmbeddingService,
    private readonly vectorStore: BookVectorStoreService,
  ) {}

  async retrieve(
    boundary: BookRetrievalBoundary,
    query: string,
    limit = 6,
  ): Promise<RetrievedBookChunk[]> {
    const safeLimit = Math.min(10, Math.max(1, Math.floor(limit)));
    const [vector] = await this.embeddings.embedBatch([query]);
    const hits = await this.vectorStore.searchChunkIds(
      boundary,
      vector,
      boundary.spoilerCeiling,
      Math.min(50, safeLimit * 2),
    );
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
    for (const hit of hits) {
      const chunk = byId.get(hit.id);
      if (!chunk || selected.some((item) => item.id === chunk.id)) continue;
      if (this.overlapsSelected(chunk, selected)) continue;
      selected.push(chunk);
      references.push({
        bookId: chunk.bookId,
        sectionId: chunk.sectionId,
        sectionOrder: chunk.sectionOrder,
        sectionTitle: chunk.section.title,
        chunkId: chunk.id,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        excerpt: chunk.content.slice(0, 600),
        score: hit.score,
      });
      if (references.length >= safeLimit) break;
    }
    return references;
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
