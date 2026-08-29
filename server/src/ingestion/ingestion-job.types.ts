export interface ClaimedIngestionJob {
  jobId: string;
  bookId: string;
  storageKey: string;
  originalFileName: string;
  embeddingVersion: string;
}

export interface ClaimedDeletionJob {
  jobId: string;
  bookId: string;
  ownerScope: string;
  storageKey: string;
}

export interface BookVectorizationContext {
  ownerScope: string;
  bookId: string;
  embeddingVersion: string;
  totalChunks: number;
}

export interface PreparedSection {
  id: string;
  order: number;
  title: string;
  sourceRef?: string;
  content: string;
  charCount: number;
}

export interface PreparedChunk {
  id: string;
  sectionId: string;
  sectionOrder: number;
  chunkIndex: number;
  content: string;
  startOffset: number;
  endOffset: number;
}

export class IngestionLeaseLostError extends Error {
  constructor() {
    super('Ingestion job lease is no longer active');
    this.name = 'IngestionLeaseLostError';
  }
}
