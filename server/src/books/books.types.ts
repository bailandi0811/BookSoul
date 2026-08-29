import {
  AssistantResponseDepth,
  AssistantTone,
  BookStatus,
  BookVisibility,
  ReadingMode,
} from '@prisma/client';

export interface UploadedBookFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface BookAssistantSummary {
  id: string;
  name: string;
  responseDepth: AssistantResponseDepth;
  tone: AssistantTone;
}

export interface ReadingProgressSummary {
  mode: ReadingMode;
  currentSectionOrder: number | null;
}

export interface BookView {
  id: string;
  title: string;
  author: string | null;
  visibility: BookVisibility;
  status: BookStatus;
  statusProgress: number;
  failureCode: string | null;
  failureMessage: string | null;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  sectionCount: number;
  chunkCount: number;
  readyAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  assistant: BookAssistantSummary | null;
  readingProgress: ReadingProgressSummary | null;
}
