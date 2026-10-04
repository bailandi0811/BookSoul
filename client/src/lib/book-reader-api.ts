import { apiFetch } from "./api";

export interface SectionWindow {
  bookId: string; sectionId: string; sectionOrder: number; sectionTitle: string;
  contentHash: string; totalLength: number; startOffset: number; endOffset: number;
  text: string; nextOffset: number | null;
}
export interface ReferenceLocation {
  bookId: string; sectionId: string; sectionOrder: number; contentHash: string;
  startOffset: number; endOffset: number; precision: "excerpt" | "section";
}
export interface ReaderPosition {
  bookId: string; sectionId: string; offset: number; contentHash: string;
  revision: number; updatedAt: string; contentChanged: boolean;
}
export interface SaveReaderPositionInput {
  sectionId: string; offset: number; contentHash: string; expectedRevision: number;
}
export class ReaderApiError extends Error { constructor(public status: number, public code: string | null, message: string) { super(message); } }
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const integer = (value: unknown, min = 0): value is number => Number.isSafeInteger(value) && (value as number) >= min;
const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function invalid(): never { throw new Error("阅读服务响应无效"); }

async function request<T>(path: string, parse: (data: unknown) => T, parent?: AbortSignal, input?: SaveReaderPositionInput): Promise<T> {
  parent?.throwIfAborted();
  const controller = new AbortController();
  const cancel = () => controller.abort(parent?.reason);
  parent?.addEventListener("abort", cancel, { once: true });
  let rejectAbort!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener("abort", rejectAbort, { once: true });
  });
  const timer = setTimeout(() => controller.abort(new DOMException("阅读服务连接超时", "TimeoutError")), 15000);
  try {
    return await Promise.race([aborted, (async () => {
      const response = await apiFetch(path, { cache: "no-store", signal: controller.signal,
        ...(input ? { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) } : {}) });
      const payload: unknown = await response.json();
      if (!response.ok) throw new ReaderApiError(response.status, record(payload) && typeof payload.code === "string" ? payload.code : null, record(payload) && typeof payload.message === "string" ? payload.message : "阅读服务暂不可用");
      if (!record(payload) || payload.success !== true) return invalid();
      return parse(payload.data);
    })()]);
  } finally {
    clearTimeout(timer); parent?.removeEventListener("abort", cancel);
    controller.signal.removeEventListener("abort", rejectAbort);
  }
}
function position(data: unknown, bookId: string): ReaderPosition {
  if (!record(data) || data.bookId !== bookId || typeof data.sectionId !== "string" || !integer(data.offset) || !hash(data.contentHash) || !integer(data.revision, 1) || typeof data.updatedAt !== "string" || !Number.isFinite(Date.parse(data.updatedAt)) || typeof data.contentChanged !== "boolean") return invalid();
  return data as unknown as ReaderPosition;
}
const bookPath = (id: string) => `/api/books/${encodeURIComponent(id)}`;
export function getSectionWindow(bookId: string, sectionId: string, offset = 0, signal?: AbortSignal, limit = 16000): Promise<SectionWindow> {
  return request(`${bookPath(bookId)}/sections/${encodeURIComponent(sectionId)}/content?offset=${offset}&limit=${limit}`, data => {
    if (!record(data) || data.bookId !== bookId || data.sectionId !== sectionId || !integer(data.sectionOrder, 1) || typeof data.sectionTitle !== "string" || !hash(data.contentHash) || !integer(data.totalLength) || !integer(data.startOffset) || !integer(data.endOffset) || data.endOffset < data.startOffset || data.endOffset > data.totalLength || typeof data.text !== "string" || data.text.length !== data.endOffset - data.startOffset || data.text.length > limit || (data.nextOffset !== null && data.nextOffset !== data.endOffset) || (data.nextOffset === null) !== (data.endOffset === data.totalLength)) return invalid();
    return data as unknown as SectionWindow;
  }, signal);
}
export function getReferenceLocation(bookId: string, chunkId: string, signal?: AbortSignal): Promise<ReferenceLocation> {
  return request(`${bookPath(bookId)}/chunks/${encodeURIComponent(chunkId)}/location`, data => {
    if (!record(data) || data.bookId !== bookId || typeof data.sectionId !== "string" || !integer(data.sectionOrder, 1) || !hash(data.contentHash) || !integer(data.startOffset) || !integer(data.endOffset) || data.endOffset < data.startOffset || !["excerpt", "section"].includes(String(data.precision))) return invalid();
    return data as unknown as ReferenceLocation;
  }, signal);
}
export function getReaderPosition(bookId: string, signal?: AbortSignal): Promise<ReaderPosition | null> {
  return request(`${bookPath(bookId)}/reading-position`, data => data === null ? null : position(data, bookId), signal);
}
export function saveReaderPosition(bookId: string, input: SaveReaderPositionInput, signal?: AbortSignal): Promise<ReaderPosition> {
  return request(`${bookPath(bookId)}/reading-position`, data => position(data, bookId), signal, input);
}
