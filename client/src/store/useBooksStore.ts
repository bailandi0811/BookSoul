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
import { ensureBookChat } from "@/lib/book-workspace-navigation";
import { useReaderStore } from "./useReaderStore";
import { useAuthStore } from "./useAuthStore";

export type BooksView = "library" | "book" | "reader" | "workspace";
let navigationGeneration = 0;
let metadataAbort = new AbortController();

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
  openBook: (bookId: string, target?: Exclude<BooksView, "library">) => Promise<void>;
  switchBookView: (target: Exclude<BooksView, "library">) => Promise<void>;
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
      if (get().currentBook?.id === bookId) {
        metadataAbort.abort(); navigationGeneration++;
        useReaderStore.getState().clearPrivateState(); useChatStore.getState().resetBookChat();
        set({ view: "library", currentBook: null, sections: [], readingProgress: null, assistant: null });
      }
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

  openBook: async (bookId, target = "workspace") => {
    const book = get().books.find((item) => item.id === bookId);
    if (!book || book.status !== "READY") return;
    if (get().currentBook?.id === bookId && get().sections.length && !get().isWorkspaceLoading && !get().workspaceError) {
      await get().switchBookView(target); return;
    }
    const generation = ++navigationGeneration;
    const authGeneration = useAuthStore.getState().authGeneration;
    metadataAbort.abort(); metadataAbort = new AbortController();
    const valid = () => generation === navigationGeneration && authGeneration === useAuthStore.getState().authGeneration && get().currentBook?.id === bookId;
    useChatStore.getState().stopGenerating();
    if (useReaderStore.getState().bookId !== bookId) useReaderStore.getState().clearPrivateState();
    set({
      view: target,
      currentBook: book,
      sections: [],
      readingProgress: null,
      assistant: null,
      isWorkspaceLoading: true,
      workspaceError: null,
    });
    try {
      const [sections, readingProgress, assistant] = await Promise.all([
        listSections(bookId, metadataAbort.signal),
        getReadingProgress(bookId, metadataAbort.signal),
        getBookAssistant(bookId, metadataAbort.signal),
      ]);
      if (!valid()) return;
      set({ sections, readingProgress, assistant, isWorkspaceLoading: false });
      if (get().view === "workspace") await ensureBookChat(bookId);
      else if (get().view === "reader") await useReaderStore.getState().openReader(bookId, sections);
    } catch (error) {
      if (valid()) set({ workspaceError: errorMessage(error) });
    } finally {
      if (valid()) set({ isWorkspaceLoading: false });
    }
  },

  switchBookView: async target => {
    const book = get().currentBook; if (!book) return;
    useChatStore.getState().stopGenerating(); void useReaderStore.getState().flushSave();
    set({ view: target });
    if (get().isWorkspaceLoading) return;
    if (target === "workspace") await ensureBookChat(book.id);
    else if (target === "reader") await useReaderStore.getState().openReader(book.id, get().sections);
  },

  backToLibrary: () => {
    useChatStore.getState().stopGenerating(); void useReaderStore.getState().flushSave();
    set({
      view: "library",
    });
  },

  updateProgress: async (mode, currentSectionOrder) => {
    const book = get().currentBook;
    if (!book) return;
    const generation = navigationGeneration;
    set({ workspaceError: null });
    try {
      const readingProgress = await updateReadingProgressRequest(book.id, {
        mode,
        ...(currentSectionOrder == null ? {} : { currentSectionOrder }),
      });
      if (generation !== navigationGeneration || get().currentBook?.id !== book.id) return;
      set((state) => ({
        readingProgress,
        currentBook: state.currentBook
          ? { ...state.currentBook, readingProgress }
          : null,
      }));
    } catch (error) {
      if (generation === navigationGeneration && get().currentBook?.id === book.id) {
        set({ workspaceError: errorMessage(error) });
      }
    }
  },

  updateAssistant: async (input) => {
    const book = get().currentBook;
    if (!book) return false;
    const generation = navigationGeneration;
    set({ workspaceError: null });
    try {
      const assistant = await updateBookAssistantRequest(book.id, input);
      if (generation !== navigationGeneration || get().currentBook?.id !== book.id) return false;
      set({ assistant });
      return true;
    } catch (error) {
      if (generation === navigationGeneration && get().currentBook?.id === book.id) {
        set({ workspaceError: errorMessage(error) });
      }
      return false;
    }
  },

  clearPrivateState: () => {
    navigationGeneration++; metadataAbort.abort();
    useReaderStore.getState().clearPrivateState();
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
