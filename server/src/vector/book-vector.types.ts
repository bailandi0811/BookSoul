export interface BookVectorChunk {
  id: string;
  sectionId: string;
  sectionOrder: number;
  chunkIndex: number;
  content: string;
}

export interface BookVectorRecord {
  id: string;
  ownerScope: string;
  bookId: string;
  sectionId: string;
  sectionOrder: number;
  chunkIndex: number;
  embeddingVersion: string;
  vector: number[];
}

export interface BookVectorScope {
  ownerScope: string;
  bookId: string;
  embeddingVersion: string;
}

export interface BookVectorSearchHit {
  id: string;
  score: number;
}
