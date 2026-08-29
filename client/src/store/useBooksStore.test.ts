import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookAssistant, BookView, ReadingProgress } from "@/lib/books-api";

const apiMocks = vi.hoisted(() => ({
  listBooks: vi.fn(),
  uploadBook: vi.fn(),
  retryBook: vi.fn(),
  deleteBook: vi.fn(),
  listSections: vi.fn(),
  getReadingProgress: vi.fn(),
  updateReadingProgress: vi.fn(),
  getBookAssistant: vi.fn(),
  updateBookAssistant: vi.fn(),
}));

vi.mock("@/lib/books-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/books-api")>()),
  ...apiMocks,
}));

import { useBooksStore } from "./useBooksStore";
import { useChatStore } from "./useChatStore";

const readyBook: BookView = {
  id: "book-a",
  title: "长夜行",
  author: null,
  visibility: "PRIVATE",
  status: "READY",
  statusProgress: 100,
  failureCode: null,
  failureMessage: null,
  originalFileName: "长夜行.txt",
  mimeType: "text/plain",
  fileSizeBytes: 1024,
  sectionCount: 2,
  chunkCount: 4,
  readyAt: "2026-08-29T00:00:00.000Z",
  createdAt: "2026-08-29T00:00:00.000Z",
  updatedAt: "2026-08-29T00:00:00.000Z",
  assistant: null,
  readingProgress: null,
};

const progress: ReadingProgress = {
  mode: "NOT_STARTED",
  currentSectionOrder: null,
  spoilerCeiling: 1,
  updatedAt: "2026-08-29T00:00:00.000Z",
};

const assistant: BookAssistant = {
  id: "assistant-a",
  bookId: "book-a",
  name: "《长夜行》阅读助手",
  responseDepth: "BALANCED",
  tone: "NATURAL",
  customInstruction: null,
  createdAt: "2026-08-29T00:00:00.000Z",
  updatedAt: "2026-08-29T00:00:00.000Z",
};

describe("private bookshelf state", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    useBooksStore.getState().clearPrivateState();
    apiMocks.listBooks.mockResolvedValue([]);
    apiMocks.listSections.mockResolvedValue([
      { id: "section-a", order: 1, title: "第一节", charCount: 120 },
    ]);
    apiMocks.getReadingProgress.mockResolvedValue(progress);
    apiMocks.getBookAssistant.mockResolvedValue(assistant);
    vi.spyOn(useChatStore.getState(), "prepareBook").mockResolvedValue();
  });

  it("loads only books returned by the authenticated API", async () => {
    apiMocks.listBooks.mockResolvedValue([readyBook]);

    await useBooksStore.getState().fetchBooks();

    expect(useBooksStore.getState().books).toEqual([readyBook]);
    expect(useBooksStore.getState().error).toBeNull();
  });

  it("adds an accepted upload to the shelf immediately", async () => {
    const queued = { ...readyBook, id: "book-new", status: "QUEUED" as const };
    apiMocks.uploadBook.mockResolvedValue(queued);

    await expect(
      useBooksStore
        .getState()
        .uploadBook(new File(["novel"], "novel.txt", { type: "text/plain" })),
    ).resolves.toBe(true);

    expect(useBooksStore.getState().books[0]).toEqual(queued);
  });

  it("opens a ready book and prepares only that book session scope", async () => {
    useBooksStore.setState({ books: [readyBook] });

    await useBooksStore.getState().openBook("book-a");

    expect(useBooksStore.getState()).toMatchObject({
      view: "workspace",
      currentBook: readyBook,
      readingProgress: progress,
      assistant,
    });
    expect(useChatStore.getState().prepareBook).toHaveBeenCalledWith("book-a");
  });

  it("does not open a book before processing is ready", async () => {
    useBooksStore.setState({
      books: [{ ...readyBook, status: "EMBEDDING" }],
    });

    await useBooksStore.getState().openBook("book-a");

    expect(useBooksStore.getState().view).toBe("library");
    expect(useChatStore.getState().prepareBook).not.toHaveBeenCalled();
  });

  it("removes a book only after the delete request is accepted", async () => {
    useBooksStore.setState({ books: [readyBook] });
    apiMocks.deleteBook.mockResolvedValue(undefined);

    await useBooksStore.getState().deleteBook("book-a");

    expect(apiMocks.deleteBook).toHaveBeenCalledWith("book-a");
    expect(useBooksStore.getState().books).toEqual([]);
  });
});
