import {
  apiFetch,
  apiUpload,
  readApiError,
  type ApiUploadProgress,
} from "@/lib/api";

export type BookUploadProgress = ApiUploadProgress;

export type BookStatus =
  | "QUEUED"
  | "PARSING"
  | "CHUNKING"
  | "EMBEDDING"
  | "READY"
  | "FAILED"
  | "DELETING";

export type ReadingMode = "NOT_STARTED" | "IN_PROGRESS" | "FINISHED";

export interface BookAssistantSummary {
  id: string;
  name: string;
  responseDepth: "BRIEF" | "BALANCED" | "DEEP";
  tone: "NATURAL" | "WARM" | "ANALYTICAL";
}

export interface ReadingProgressSummary {
  mode: ReadingMode;
  currentSectionOrder: number | null;
}

export interface BookView {
  id: string;
  title: string;
  author: string | null;
  visibility: "PRIVATE" | "SYSTEM";
  status: BookStatus;
  statusProgress: number;
  failureCode: string | null;
  failureMessage: string | null;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  sectionCount: number;
  chunkCount: number;
  readyAt: string | null;
  createdAt: string;
  updatedAt: string;
  assistant: BookAssistantSummary | null;
  readingProgress: ReadingProgressSummary | null;
}

export interface BookSection {
  id: string;
  order: number;
  title: string;
  charCount: number;
}

export interface ReadingProgress extends ReadingProgressSummary {
  updatedAt: string;
  spoilerCeiling: number;
}

export interface BookAssistant extends BookAssistantSummary {
  bookId: string;
  customInstruction: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SuccessResponse<T> {
  success: true;
  data: T;
}

async function readData<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(await readApiError(response));
  const payload = (await response.json()) as SuccessResponse<T>;
  return payload.data;
}

export async function listBooks(): Promise<BookView[]> {
  return readData<BookView[]>(await apiFetch("/api/books"));
}

export async function getBook(bookId: string): Promise<BookView> {
  return readData<BookView>(await apiFetch(`/api/books/${bookId}`));
}

export async function uploadBook(
  file: File,
  onProgress?: (progress: BookUploadProgress) => void,
): Promise<BookView> {
  const body = new FormData();
  body.append("file", file);
  return readData<BookView>(
    await apiUpload("/api/books", body, onProgress),
  );
}

export async function retryBook(bookId: string): Promise<BookView> {
  return readData<BookView>(
    await apiFetch(`/api/books/${bookId}/retry`, { method: "POST" }),
  );
}

export async function deleteBook(bookId: string): Promise<void> {
  await readData<Record<string, never>>(
    await apiFetch(`/api/books/${bookId}`, { method: "DELETE" }),
  );
}

export async function listSections(bookId: string): Promise<BookSection[]> {
  return readData<BookSection[]>(
    await apiFetch(`/api/books/${bookId}/sections`),
  );
}

export async function getReadingProgress(
  bookId: string,
): Promise<ReadingProgress> {
  return readData<ReadingProgress>(
    await apiFetch(`/api/books/${bookId}/reading-progress`),
  );
}

export async function updateReadingProgress(
  bookId: string,
  input: {
    mode: ReadingMode;
    currentSectionOrder?: number | null;
  },
): Promise<ReadingProgress> {
  return readData<ReadingProgress>(
    await apiFetch(`/api/books/${bookId}/reading-progress`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function getBookAssistant(bookId: string): Promise<BookAssistant> {
  return readData<BookAssistant>(
    await apiFetch(`/api/books/${bookId}/assistant`),
  );
}

export async function updateBookAssistant(
  bookId: string,
  input: Partial<
    Pick<BookAssistant, "name" | "responseDepth" | "tone" | "customInstruction">
  >,
): Promise<BookAssistant> {
  return readData<BookAssistant>(
    await apiFetch(`/api/books/${bookId}/assistant`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}
