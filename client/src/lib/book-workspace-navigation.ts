import { useAuthStore } from "@/store/useAuthStore";
import { useBooksStore } from "@/store/useBooksStore";
import { useChatStore } from "@/store/useChatStore";
import { useReaderStore } from "@/store/useReaderStore";
import type { Reference } from "@/store/useChatStore";
import { getReferenceLocation } from "@/lib/book-reader-api";

let preparing: { bookId: string; generation: number; promise: Promise<void> } | null = null;
export async function ensureBookChat(bookId: string): Promise<void> {
  const generation = useAuthStore.getState().authGeneration;
  if (useBooksStore.getState().currentBook?.id !== bookId) return;
  if (preparing?.bookId === bookId && preparing.generation === generation) return preparing.promise;
  if (useChatStore.getState().currentBookId === bookId) return;
  const work = useChatStore.getState().prepareBook(bookId).finally(() => {
    if (preparing?.promise === work) preparing = null;
  });
  preparing = { bookId, generation, promise: work };
  await work;
}

export async function openReferenceInReader(reference: Reference, sectionOnly = false): Promise<void> {
  const { currentBook, sections } = useBooksStore.getState();
  if (currentBook?.id !== reference.bookId) throw new Error("这条引用不属于当前书籍");
  const generation = useAuthStore.getState().authGeneration;
  const active = () => useBooksStore.getState().currentBook?.id === reference.bookId && useAuthStore.getState().authGeneration === generation;
  const location = sectionOnly ? null : await getReferenceLocation(reference.bookId, reference.chunkId);
  if (!active()) return;
  await useReaderStore.getState().primePreview(reference.bookId, sections);
  if (!active()) return;
  await useBooksStore.getState().switchBookView("reader");
  if (!active()) return;
  if (sectionOnly) await useReaderStore.getState().previewSection(reference.sectionId);
  else if (location) await useReaderStore.getState().previewLocation(location);
}
