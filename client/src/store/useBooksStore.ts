import { create } from "zustand";
import {
  deleteBook as deleteBookRequest,
  getBookAssistant,
  getReadingProgress,
  listBooks,
  listSections,
  retryBook as retryBookRequest,
  updateBookAssistant as updateBookAssistantRequest,
  updateReadingProgress as updateReadingProgressRequest,
  uploadBook as uploadBookRequest,
  type BookAssistant,
  type BookSection,
  type BookUploadProgress,
  type BookView,
  type ReadingMode,
  type ReadingProgress,
} from "@/lib/books-api";
import { useChatStore } from "@/store/useChatStore";
import { assignBookCoverBindings, type CoverVariant } from "@/lib/book-cover";

export type BooksView = "library" | "workspace";

interface BooksState {
  view: BooksView;
  books: BookView[];
  coverBindings: Record<string, CoverVariant>;
  isLoading: boolean;
  isUploading: boolean;
  uploadFileName: string | null;
  uploadProgress: BookUploadProgress | null;
  mutatingBookIds: string[];
  error: string | null;
  currentBook: BookView | null;
  sections: BookSection[];
  readingProgress: ReadingProgress | null;
  assistant: BookAssistant | null;
  isWorkspaceLoading: boolean;
  workspaceError: string | null;
  fetchBooks: () => Promise<void>;
  uploadBook: (file: File) => Promise<boolean>;
  retryBook: (bookId: string) => Promise<void>;
  deleteBook: (bookId: string) => Promise<void>;
  openBook: (bookId: string) => Promise<void>;
  backToLibrary: () => void;
  updateProgress: (
    mode: ReadingMode,
    currentSectionOrder?: number | null,
  ) => Promise<void>;
  updateAssistant: (
    input: Partial<
      Pick<
        BookAssistant,
        "name" | "responseDepth" | "tone" | "customInstruction"
      >
    >,
  ) => Promise<boolean>;
  clearPrivateState: () => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "请求失败，请稍后重试";
}

export const useBooksStore = create<BooksState>((set, get) => ({
  view: "library",
  books: [],
  coverBindings: {},
  isLoading: false,
  isUploading: false,
  uploadFileName: null,
  uploadProgress: null,
  mutatingBookIds: [],
  error: null,
  currentBook: null,
  sections: [],
  readingProgress: null,
  assistant: null,
  isWorkspaceLoading: false,
  workspaceError: null,

  fetchBooks: async () => {
    const showInitialLoading = get().books.length === 0;
    set({ isLoading: showInitialLoading, error: null });
    try {
      const books = await listBooks();
      set((state) => ({
        books,
        coverBindings: assignBookCoverBindings(books, state.coverBindings),
      }));
    } catch (error) {
      set({ error: errorMessage(error) });
    } finally {
      if (showInitialLoading) set({ isLoading: false });
    }
  },

  uploadBook: async (file) => {
    set({
      isUploading: true,
      uploadFileName: file.name,
      uploadProgress: {
        loadedBytes: 0,
        totalBytes: file.size,
        percent: 0,
      },
      error: null,
    });
    try {
      const book = await uploadBookRequest(file, (uploadProgress) => {
        set({ uploadProgress });
      });
      set((state) => {
        const books = [book, ...state.books];
        return {
          books,
          coverBindings: assignBookCoverBindings(books, state.coverBindings),
        };
      });
      return true;
    } catch (error) {
      set({ error: errorMessage(error) });
      return false;
    } finally {
      set({
        isUploading: false,
        uploadFileName: null,
        uploadProgress: null,
      });
    }
  },

  retryBook: async (bookId) => {
    set((state) => ({
      mutatingBookIds: [...state.mutatingBookIds, bookId],
      error: null,
    }));
    try {
      const book = await retryBookRequest(bookId);
      set((state) => ({
        books: state.books.map((item) => (item.id === bookId ? book : item)),
      }));
    } catch (error) {
      set({ error: errorMessage(error) });
    } finally {
      set((state) => ({
        mutatingBookIds: state.mutatingBookIds.filter((id) => id !== bookId),
      }));
    }
  },

  deleteBook: async (bookId) => {
    set((state) => ({
      mutatingBookIds: [...state.mutatingBookIds, bookId],
      error: null,
    }));
    try {
      await deleteBookRequest(bookId);
      set((state) => {
        const books = state.books.filter((book) => book.id !== bookId);
        return {
          books,
          coverBindings: assignBookCoverBindings(books, state.coverBindings),
        };
      });
    } catch (error) {
      set({ error: errorMessage(error) });
    } finally {
      set((state) => ({
        mutatingBookIds: state.mutatingBookIds.filter((id) => id !== bookId),
      }));
    }
  },

  openBook: async (bookId) => {
    const book = get().books.find((item) => item.id === bookId);
    if (!book || book.status !== "READY") return;
    set({
      view: "workspace",
      currentBook: book,
      sections: [],
      readingProgress: null,
      assistant: null,
      isWorkspaceLoading: true,
      workspaceError: null,
    });
    try {
      const [sections, readingProgress, assistant] = await Promise.all([
        listSections(bookId),
        getReadingProgress(bookId),
        getBookAssistant(bookId),
      ]);
      set({ sections, readingProgress, assistant });
      await useChatStore.getState().prepareBook(bookId);
    } catch (error) {
      set({ workspaceError: errorMessage(error) });
    } finally {
      set({ isWorkspaceLoading: false });
    }
  },

  backToLibrary: () => {
    useChatStore.getState().resetBookChat();
    set({
      view: "library",
      currentBook: null,
      sections: [],
      readingProgress: null,
      assistant: null,
      workspaceError: null,
    });
  },

  updateProgress: async (mode, currentSectionOrder) => {
    const book = get().currentBook;
    if (!book) return;
    set({ workspaceError: null });
    try {
      const readingProgress = await updateReadingProgressRequest(book.id, {
        mode,
        ...(currentSectionOrder == null ? {} : { currentSectionOrder }),
      });
      set((state) => ({
        readingProgress,
        currentBook: state.currentBook
          ? { ...state.currentBook, readingProgress }
          : null,
      }));
    } catch (error) {
      set({ workspaceError: errorMessage(error) });
    }
  },

  updateAssistant: async (input) => {
    const book = get().currentBook;
    if (!book) return false;
    set({ workspaceError: null });
    try {
      const assistant = await updateBookAssistantRequest(book.id, input);
      set({ assistant });
      return true;
    } catch (error) {
      set({ workspaceError: errorMessage(error) });
      return false;
    }
  },

  clearPrivateState: () => {
    useChatStore.getState().resetBookChat();
    set({
      view: "library",
      books: [],
      coverBindings: {},
      isLoading: false,
      isUploading: false,
      uploadFileName: null,
      uploadProgress: null,
      mutatingBookIds: [],
      error: null,
      currentBook: null,
      sections: [],
      readingProgress: null,
      assistant: null,
      isWorkspaceLoading: false,
      workspaceError: null,
    });
  },
}));
