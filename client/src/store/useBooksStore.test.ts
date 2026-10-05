import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BookAssistant,
  BookUploadProgress,
  BookView,
  ReadingProgress,
} from "@/lib/books-api";

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
import { useReaderStore } from "./useReaderStore";

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

  it("opens book space without preparing chat and preserves same-book metadata", async () => {
    useBooksStore.setState({ books: [readyBook] });
    await useBooksStore.getState().openBook(readyBook.id, "book");
    expect(useBooksStore.getState().view).toBe("book");
    expect(useChatStore.getState().prepareBook).not.toHaveBeenCalled();
    useBooksStore.getState().backToLibrary();
    await useBooksStore.getState().openBook(readyBook.id, "book");
    expect(apiMocks.listSections).toHaveBeenCalledTimes(1);
  });

  it("does not let a late book response overwrite the selected book", async () => {
    let finish!: (value: unknown[]) => void;
    apiMocks.listSections.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    useBooksStore.setState({ books: [readyBook, { ...readyBook, id: "book-b" }] });
    const first = useBooksStore.getState().openBook("book-a", "book");
    await useBooksStore.getState().openBook("book-b", "book");
    finish([{ id: "old-section", order: 1, title: "旧书", charCount: 20 }]);
    await first;
    expect(useBooksStore.getState().currentBook?.id).toBe("book-b");
    expect(useBooksStore.getState().sections[0].id).not.toBe("old-section");
  });

  it("prepares chat when the user changes from a still-loading reader", async () => {
    let finish!: () => void;
    const opening = vi.spyOn(useReaderStore.getState(), "openReader").mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    useBooksStore.setState({ books: [readyBook] });
    const first = useBooksStore.getState().openBook("book-a", "reader");
    await vi.waitFor(() => expect(opening).toHaveBeenCalledOnce());
    await useBooksStore.getState().switchBookView("book");
    await useBooksStore.getState().switchBookView("workspace");
    expect(useChatStore.getState().prepareBook).toHaveBeenCalledWith("book-a");
    finish(); await first;
    expect(useBooksStore.getState().view).toBe("workspace");
  });
  it("keeps a newer reading mark when an older confirmed save arrives", () => {
    const newer = { mode: "IN_PROGRESS" as const, currentSectionOrder: 30, spoilerCeiling: 30, updatedAt: "2026-10-04T02:00:00.000Z" };
    const older = { ...newer, currentSectionOrder: 4, spoilerCeiling: 4, updatedAt: "2026-10-04T01:00:00.000Z" };
    useBooksStore.setState({ books: [{ ...readyBook, readingProgress: newer }], currentBook: { ...readyBook, readingProgress: newer }, readingProgress: newer });
    useBooksStore.getState().applyConfirmedProgress("book-a", older);
    expect(useBooksStore.getState().readingProgress?.currentSectionOrder).toBe(30);
    expect(useBooksStore.getState().books[0]?.readingProgress?.currentSectionOrder).toBe(30);
  });
  it("ignores an old progress failure after switching books", async () => {
    let reject!: (error: Error) => void;
    apiMocks.updateReadingProgress.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    useBooksStore.setState({ books: [readyBook, { ...readyBook, id: "book-b" }] });
    await useBooksStore.getState().openBook("book-a", "book");
    const pending = useBooksStore.getState().updateProgress("IN_PROGRESS", 1);
    await useBooksStore.getState().openBook("book-b", "book");
    reject(new Error("旧书请求失败")); await pending;
    expect(useBooksStore.getState().workspaceError).toBeNull();
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

  it("keeps surviving cover bindings after deletion and polling, then clears them with private state", async () => {
    const books = Array.from({ length: 4 }, (_, index) => ({
      ...readyBook,
      id: `binding-${index}`,
      createdAt: `2026-09-0${index + 1}T00:00:00Z`,
    }));
    apiMocks.listBooks.mockResolvedValue(books);
    await useBooksStore.getState().fetchBooks();
    const initial = useBooksStore.getState().coverBindings;
    expect(new Set(Object.values(initial)).size).toBe(4);
    apiMocks.deleteBook.mockResolvedValue(undefined);
    await useBooksStore.getState().deleteBook(books[0].id);
    apiMocks.listBooks.mockResolvedValue([...books.slice(1)].reverse());
    await useBooksStore.getState().fetchBooks();
    const surviving = useBooksStore.getState().coverBindings;
    for (const book of books.slice(1))
      expect(surviving[book.id]).toBe(initial[book.id]);
    expect(surviving[books[0].id]).toBeUndefined();
    useBooksStore.getState().clearPrivateState();
    expect(useBooksStore.getState().coverBindings).toEqual({});
  });

  it("exposes byte progress while a file is uploading", async () => {
    const queued = { ...readyBook, id: "book-new", status: "QUEUED" as const };
    let finishUpload: ((book: BookView) => void) | undefined;
    apiMocks.uploadBook.mockImplementation(
      (_file: File, onProgress?: (progress: BookUploadProgress) => void) => {
        onProgress?.({
          loadedBytes: 512,
          totalBytes: 1024,
          percent: 50,
        });
        return new Promise<BookView>((resolve) => {
          finishUpload = resolve;
        });
      },
    );

    const upload = useBooksStore
      .getState()
      .uploadBook(new File(["novel"], "novel.txt", { type: "text/plain" }));

    expect(useBooksStore.getState()).toMatchObject({
      isUploading: true,
      uploadFileName: "novel.txt",
      uploadProgress: {
        loadedBytes: 512,
        totalBytes: 1024,
        percent: 50,
      },
    });

    finishUpload?.(queued);
    await expect(upload).resolves.toBe(true);
    expect(useBooksStore.getState()).toMatchObject({
      isUploading: false,
      uploadFileName: null,
      uploadProgress: null,
    });
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
