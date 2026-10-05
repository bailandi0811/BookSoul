export interface SectionWindow {
  bookId: string;
  sectionId: string;
  sectionOrder: number;
  sectionTitle: string;
  contentHash: string;
  totalLength: number;
  startOffset: number;
  endOffset: number;
  text: string;
  nextOffset: number | null;
}
export interface ReferenceLocation {
  bookId: string;
  sectionId: string;
  sectionOrder: number;
  contentHash: string;
  startOffset: number;
  endOffset: number;
  precision: 'excerpt' | 'section';
}
export interface ConfirmedReadingProgress {
  mode: 'NOT_STARTED' | 'IN_PROGRESS' | 'FINISHED';
  currentSectionOrder: number | null;
  updatedAt: string;
  spoilerCeiling: number;
}
export interface ReaderPosition {
  bookId: string;
  sectionId: string;
  offset: number;
  contentHash: string;
  revision: number;
  updatedAt: string;
  contentChanged: boolean;
  readingProgress?: ConfirmedReadingProgress;
}
export interface SaveReaderPositionInput {
  sectionId: string;
  offset: number;
  contentHash: string;
  expectedRevision: number;
}
