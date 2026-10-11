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
import { bindConfirmedReadingProgress, useReaderStore } from "./useReaderStore";
import { useAuthStore } from "./useAuthStore";
import type { BookUploadStage } from '@/lib/book-direct-upload';

export type BooksView = "library" | "book" | "reader" | "workspace";
let navigationGeneration = 0;
let metadataAbort = new AbortController();
let uploadAbort: AbortController | null = null;

interface BooksState {
  view: BooksView;
  books: BookView[];
  coverBindings: Record<string, CoverVariant>;
  isLoading: boolean;
  isUploading: boolean;
  uploadFileName: string | null;
  uploadProgress: BookUploadProgress | null;
  uploadStage: BookUploadStage | null;
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
  pauseUpload: () => void;
  retryBook: (bookId: string) => Promise<void>;
  deleteBook: (bookId: string) => Promise<void>;
  openBook: (bookId: string, target?: Exclude<BooksView, "library">) => Promise<void>;
  switchBookView: (target: Exclude<BooksView, "library">) => Promise<void>;
  backToLibrary: () => void;
  updateProgress: (
    mode: ReadingMode,
    currentSectionOrder?: number | null,
  ) => Promise<void>;
  applyConfirmedProgress: (bookId: string, readingProgress: ReadingProgress) => void;
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

function progressStamp(value: object | null | undefined) {
  if (!value || !("updatedAt" in value) || typeof value.updatedAt !== "string") return Number.NEGATIVE_INFINITY;
  const time = Date.parse(value.updatedAt);
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

export const useBooksStore = create<BooksState>((set, get) => ({
  view: "library",
  books: [],
  coverBindings: {},
  isLoading: false,
  isUploading: false,
  uploadFileName: null,
  uploadProgress: null,
  uploadStage: null,
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
    if (get().isUploading) return false;
    const controller = new AbortController();
    uploadAbort = controller;
    const generation = useAuthStore.getState().authGeneration;
    const current = () => uploadAbort === controller && generation === useAuthStore.getState().authGeneration && !controller.signal.aborted;
    set({
      isUploading: true,
      uploadStage: 'preparing',
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
        if (current()) set({ uploadProgress });
      }, { signal: controller.signal, onStage: uploadStage => { if (current()) set({ uploadStage }); } });
      if (!current()) return false;
      set((state) => {
        const books = [book, ...state.books.filter(item => item.id !== book.id)];
        return {
          books,
          coverBindings: assignBookCoverBindings(books, state.coverBindings),
        };
      });
      return true;
    } catch (error) {
      if (current()) set({ error: errorMessage(error) });
      return false;
    } finally {
      if (uploadAbort === controller && generation === useAuthStore.getState().authGeneration) set({
        isUploading: false,
        uploadStage: null,
        uploadFileName: null,
        uploadProgress: null,
      });
      if (uploadAbort === controller) uploadAbort = null;
    }
  },

  pauseUpload: () => { uploadAbort?.abort(); set({ error: '上传已暂停，重新选择原文件可继续上传' }); },

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
      get().applyConfirmedProgress(book.id, readingProgress);
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

  applyConfirmedProgress: (bookId, readingProgress) => {
    set((state) => ({
      books: state.books.map((item) =>
        item.id === bookId && progressStamp(readingProgress) >= progressStamp(item.readingProgress)
          ? { ...item, readingProgress }
          : item,
      ),
      readingProgress:
        state.currentBook?.id === bookId && progressStamp(readingProgress) >= progressStamp(state.readingProgress)
          ? readingProgress
          : state.readingProgress,
      currentBook:
        state.currentBook?.id === bookId && progressStamp(readingProgress) >= progressStamp(state.readingProgress)
          ? { ...state.currentBook, readingProgress }
          : state.currentBook,
    }));
  },

  clearPrivateState: () => {
    uploadAbort?.abort(); uploadAbort = null;
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
      uploadStage: null,
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

bindConfirmedReadingProgress((bookId, readingProgress) => {
  useBooksStore.getState().applyConfirmedProgress(bookId, readingProgress);
});
