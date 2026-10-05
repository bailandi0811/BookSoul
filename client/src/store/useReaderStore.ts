import { create } from "zustand";
import { useAuthStore } from "./useAuthStore";
import type { BookSection, ReadingProgress } from "@/lib/books-api";
import { getReaderPosition, getReferenceLocation, getSectionWindow, saveReaderPosition, type ReaderPosition, type ReferenceLocation, type SectionWindow } from "@/lib/book-reader-api";

type Anchor = { sectionId: string; offset: number; contentHash: string };
let publishConfirmedReadingProgress: ((bookId: string, progress: ReadingProgress) => void) | null = null;
export function bindConfirmedReadingProgress(publish: (bookId: string, progress: ReadingProgress) => void) {
  publishConfirmedReadingProgress = publish;
}
interface ReaderState {
  bookId: string | null; sections: BookSection[]; sectionId: string | null;
  windows: SectionWindow[]; position: ReaderPosition | null; positionLoaded: boolean;
  anchorOffset: number; visibleOffset: number; restoreVersion: number;
  preview: boolean; highlight: ReferenceLocation | null; notice: string | null;
  loading: boolean; loadingDirection: "next" | "previous" | null; error: string | null; saveStatus: "saved" | "dirty" | "saving" | "error" | "conflict";
  saveError: string | null;
  loadPosition: (bookId: string) => Promise<void>;
  primePreview: (bookId: string, sections: BookSection[]) => Promise<void>;
  previewLocation: (location: ReferenceLocation) => Promise<void>;
  openReader: (bookId: string, sections: BookSection[]) => Promise<void>;
  loadAdjacent: (direction: "next" | "previous") => Promise<void>;
  jumpToOffset: (offset: number, save?: boolean, sectionId?: string) => Promise<void>;
  retryWindow: () => Promise<void>;
  previewSection: (sectionId: string, offset?: number) => Promise<void>;
  goToSection: (sectionId: string) => Promise<void>;
  previewReference: (chunkId: string) => Promise<void>;
  returnToReading: () => Promise<void>; continueFromPreview: () => void;
  recordVisibleOffset: (offset: number, sectionId?: string) => void; flushSave: () => Promise<void>; retrySave: () => Promise<void>;
  clearPrivateState: () => void;
}
const empty = () => ({ bookId: null, sections: [], sectionId: null, windows: [], position: null, positionLoaded: false, anchorOffset: 0, visibleOffset: 0, restoreVersion: 0, preview: false, highlight: null, notice: null, loading: false, loadingDirection: null, error: null, saveStatus: "saved" as const, saveError: null });
let bookGeneration = 0, sectionGeneration = 0;
let bookAbort = new AbortController(), sectionAbort = new AbortController();
let positionPending: Promise<void> | null = null, opening: Promise<void> | null = null;
let saving: Promise<void> | null = null, queued: Anchor | null = null, readingAnchor: Anchor | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const pending = new Map<string, Promise<SectionWindow | null>>();
let failedWindow: { sectionId: string; offset: number; limit: number; direction: "next" | "previous" | "initial" } | null = null;
let failedJump: { sectionId: string; offset: number; save: boolean } | null = null;
let staleContent = false;
const message = (error: unknown) => error instanceof Error ? error.message : "阅读服务暂不可用";

export const useReaderStore = create<ReaderState>((set, get) => {
  const active = (generation: number) => generation === bookGeneration && !bookAbort.signal.aborted;
  const scope = (bookId: string) => {
    if (get().bookId === bookId) return;
    get().clearPrivateState(); set({ bookId });
  };
  const recoverContentChange = async (sectionId: string, generation: number) => {
    const bookId = get().bookId;
    if (!bookId) return;
    const version = sectionGeneration;
    queued = null; staleContent = true;
    try {
      const position = await getReaderPosition(bookId, bookAbort.signal);
      if (!active(generation) || version !== sectionGeneration) return;
      set({ position, positionLoaded: true });
      const reload = chapter(sectionId, 0, get().preview), reloadVersion = sectionGeneration;
      await reload;
      if (active(generation) && reloadVersion === sectionGeneration) set({ notice: "正文已变更，已回到该节开头；确认后保存新位置", saveStatus: "error", saveError: "正文已变更，请确认从本节开头继续" });
    } catch (error) {
      if (active(generation) && version === sectionGeneration) set({ saveStatus: "error", saveError: message(error) });
    }
  };
  const load = (offset: number, direction: "initial" | "next" | "previous", limit = 16000, sectionId = get().sectionId): Promise<SectionWindow | null> => {
    const { bookId } = get();
    if (!bookId || !sectionId) return Promise.resolve(null);
    const generation = bookGeneration, chapter = sectionGeneration;
    const key = `${useAuthStore.getState().authGeneration}:${bookId}:${sectionId}:${offset}:${limit}`;
    if (pending.has(key)) return pending.get(key)!;
    if (pending.size >= 2) return Promise.resolve(null);
    if (direction !== "initial") set({ loadingDirection: direction });
    const promise = getSectionWindow(bookId, sectionId, offset, sectionAbort.signal, limit).then(data => {
      if (!active(generation) || chapter !== sectionGeneration) return null;
      const current = get().windows;
      const sameChapter = current.find(w => w.sectionId === sectionId);
      if (sameChapter && sameChapter.contentHash !== data.contentHash) throw new Error("正文已变更，请重新打开本节");
      // One extra UTF-16 unit prevents a gap when a backward boundary falls inside an emoji.
      if (direction === "previous" && sameChapter) {
        const end = sameChapter.startOffset;
        if (data.endOffset < end) throw new Error("正文窗口不连续，请重试");
        data = { ...data, text: data.text.slice(0, end - data.startOffset), endOffset: end, nextOffset: end };
      }
      const order = (id: string) => get().sections.find(s => s.id === id)?.order ?? 0;
      let windows = [...current.filter(w => w.sectionId !== sectionId || w.startOffset !== data.startOffset), data].sort((a, b) => order(a.sectionId) - order(b.sectionId) || a.startOffset - b.startOffset);
      if (windows.length > 3) {
        const retained = direction === "previous" ? windows.slice(0, 3) : windows.slice(-3);
        const { sectionId: visibleSection, visibleOffset } = get();
        // Recheck after the request: the reader may have reversed while it was in flight.
        if (windows.some(w => !retained.includes(w) && w.sectionId === visibleSection && visibleOffset >= w.startOffset && visibleOffset < w.endOffset)) return null;
        windows = retained;
      }
      failedWindow = null; set({ windows, error: null }); return data;
    }).catch(async error => {
      if (active(generation) && chapter === sectionGeneration && !sectionAbort.signal.aborted) {
        if (message(error) === "正文已变更，请重新打开本节") await recoverContentChange(sectionId, generation);
        else { failedWindow = { sectionId, offset, limit, direction }; set({ error: message(error) }); }
      }
      return null;
    }).finally(() => {
      if (pending.get(key) === promise) pending.delete(key);
      if (active(generation) && chapter === sectionGeneration && !pending.size) set({ loadingDirection: null });
    });
    pending.set(key, promise); return promise;
  };
  const chapter = async (sectionId: string, offset: number, preview: boolean, highlight: ReferenceLocation | null = null) => {
    if (!get().sections.some(s => s.id === sectionId)) { set({ error: "章节不存在，请重新打开本书" }); return; }
    sectionAbort.abort(); sectionAbort = new AbortController(); sectionGeneration++; pending.clear(); failedWindow = null; failedJump = null;
    const version = sectionGeneration;
    set({ sectionId, windows: [], anchorOffset: offset, visibleOffset: offset, preview, highlight, loading: true, loadingDirection: null, error: null, restoreVersion: get().restoreVersion + 1 });
    const data = await load(Math.max(0, offset - 8000), "initial");
    if (version !== sectionGeneration) return;
    if (data && highlight && highlight.contentHash !== data.contentHash) set({ highlight: null, notice: "正文已变更，无法精确高亮这条引用" });
    if (data && !preview) readingAnchor = { sectionId, offset, contentHash: data.contentHash };
    set({ loading: false });
  };
  return {
    ...empty(),
    loadPosition: async bookId => {
      scope(bookId); if (get().positionLoaded) return;
      if (positionPending) return positionPending;
      const generation = bookGeneration;
      const work = getReaderPosition(bookId, bookAbort.signal).then(position => {
        if (active(generation)) set({ position, positionLoaded: true });
      }).catch(error => { if (active(generation)) set({ saveStatus: "error", saveError: `无法读取续读位置：${message(error)}` }); }).finally(() => { if (positionPending === work) positionPending = null; });
      positionPending = work; return work;
    },
    primePreview: async (bookId, sections) => {
      const localAnchor = get().bookId === bookId ? readingAnchor : null;
      scope(bookId);
      const generation = bookGeneration;
      await get().flushSave();
      if (!active(generation)) return;
      set({ sections, preview: true, loading: true, windows: [] });
      await get().loadPosition(bookId);
      if (!active(generation)) return;
      if (!get().positionLoaded || get().bookId !== bookId) throw new Error("暂时无法恢复续读位置，请稍后重试");
      const saved = get().position;
      const start = sections.find(s => s.id === saved?.sectionId) ?? sections[0];
      readingAnchor = localAnchor ?? (start ? { sectionId: start.id, offset: saved?.contentChanged ? 0 : saved?.offset ?? 0, contentHash: saved?.contentHash ?? "" } : null);
      set({ loading: false });
    },
    previewLocation: async location => {
      if (location.bookId !== get().bookId) throw new Error("这条引用不属于当前书籍");
      if (location.precision === "section") set({ notice: "这条引用无法精确定位，已打开原章节" });
      await chapter(location.sectionId, location.startOffset, true, location);
    },
    openReader: async (bookId, sections) => {
      scope(bookId); set({ sections });
      if (get().preview) return;
      if (get().windows.length) { set({ anchorOffset: get().visibleOffset, restoreVersion: get().restoreVersion + 1 }); return; }
      if (opening) return opening;
      const generation = bookGeneration;
      const work = (async () => {
        await get().loadPosition(bookId);
        if (!active(generation) || !get().positionLoaded) return;
        const saved = get().position;
        const section = sections.find(s => s.id === saved?.sectionId) ?? sections[0];
        if (!section) { set({ error: "本书没有可阅读的章节" }); return; }
        if (saved?.contentChanged) set({ notice: "正文已变更，已回到该节开头；原续读记录保留" });
        await chapter(section.id, saved && !saved.contentChanged && saved.sectionId === section.id ? saved.offset : 0, false);
      })().finally(() => { if (opening === work) opening = null; });
      opening = work; return work;
    },
    loadAdjacent: async direction => {
      if (failedWindow || failedJump !== null || get().loading) return;
      const windows = get().windows; if (!windows.length) return;
      const edge = direction === "next" ? windows[windows.length - 1] : windows[0];
      // Prefetch must not remove text that is still under the reader's eyes.
      const outgoing = direction === "next" ? windows[0] : windows[windows.length - 1];
      if (windows.length >= 3 && outgoing.sectionId === get().sectionId && get().visibleOffset >= outgoing.startOffset && get().visibleOffset < outgoing.endOffset) return;
      if (direction === "next" && edge.nextOffset !== null) await load(edge.nextOffset, direction, 16000, edge.sectionId);
      else if (direction === "previous" && edge.startOffset > 0) await load(Math.max(0, edge.startOffset - 16000), direction, 16001, edge.sectionId);
      else {
        const index = get().sections.findIndex(s => s.id === edge.sectionId);
        const neighbor = get().sections[index + (direction === "next" ? 1 : -1)];
        if (neighbor) await load(direction === "next" ? 0 : Math.max(0, neighbor.charCount - 16000), direction, direction === "next" ? 16000 : 16001, neighbor.id);
      }
    },
    jumpToOffset: async (offset, save = false, sectionId = get().sectionId ?? undefined) => {
      const { bookId, windows, preview } = get();
      const currentWindow = windows.find(w => w.sectionId === sectionId);
      if (!bookId || !sectionId || !currentWindow || get().loading || !Number.isSafeInteger(offset) || offset < 0 || offset >= currentWindow.totalLength) return;
      const generation = bookGeneration;
      sectionAbort.abort(); sectionAbort = new AbortController(); sectionGeneration++; pending.clear(); failedWindow = null;
      const chapterVersion = sectionGeneration;
      const requestOffset = Math.max(0, offset - 8000);
      set({ loading: true, error: null });
      try {
        const data = await getSectionWindow(bookId, sectionId, requestOffset, sectionAbort.signal);
        if (!active(generation) || chapterVersion !== sectionGeneration) return;
        if (data.contentHash !== currentWindow.contentHash) throw new Error("正文已变更，请重新打开本节");
        failedJump = null; failedWindow = null;
        set({ sectionId, windows: [data], anchorOffset: offset, visibleOffset: offset, restoreVersion: get().restoreVersion + 1, loading: false, error: null, loadingDirection: null });
        if (save && !preview) get().recordVisibleOffset(offset);
      } catch (error) {
        if (active(generation) && chapterVersion === sectionGeneration) {
          if (message(error) === "正文已变更，请重新打开本节") await recoverContentChange(sectionId, generation);
          else { failedJump = { sectionId, offset, save }; set({ loading: false, error: message(error) }); }
        }
      }
    },
    retryWindow: async () => {
      const jump = failedJump; failedJump = null;
      if (jump !== null) { await get().jumpToOffset(jump.offset, jump.save, jump.sectionId); return; }
      const failed = failedWindow; failedWindow = null; if (failed) await load(failed.offset, failed.direction, failed.limit, failed.sectionId);
    },
    previewSection: async (id, offset = 0) => { const generation = bookGeneration; await get().flushSave(); if (active(generation)) await chapter(id, offset, true); },
    goToSection: async id => {
      const generation = bookGeneration;
      await get().flushSave(); if (!active(generation)) return;
      await chapter(id, 0, get().preview);
      if (active(generation) && !get().preview && get().windows.length) { get().recordVisibleOffset(0); await get().flushSave(); }
    },
    previewReference: async chunkId => {
      const bookId = get().bookId; if (!bookId) return;
      const generation = bookGeneration;
      const location = await getReferenceLocation(bookId, chunkId, bookAbort.signal);
      if (!active(generation)) return;
      await get().flushSave();
      if (!active(generation)) return;
      if (location.precision === "section") set({ notice: "这条引用无法精确定位，已打开原章节" });
      await chapter(location.sectionId, location.startOffset, true, location);
    },
    returnToReading: async () => {
      const anchor = readingAnchor; if (anchor) await chapter(anchor.sectionId, anchor.offset, false);
      else if (get().sections[0]) await chapter(get().sections[0].id, 0, false);
    },
    continueFromPreview: () => { set({ preview: false, highlight: null }); get().recordVisibleOffset(get().visibleOffset); },
    recordVisibleOffset: (offset, sectionId = get().sectionId ?? undefined) => {
      const { windows, preview } = get();
      const currentWindow = windows.find(w => w.sectionId === sectionId);
      if (!sectionId || !currentWindow || !Number.isSafeInteger(offset) || offset < 0 || offset > currentWindow.totalLength) return;
      set({ sectionId, visibleOffset: offset, anchorOffset: offset }); if (preview) return;
      const target = { sectionId, offset, contentHash: currentWindow.contentHash };
      readingAnchor = target; queued = target;
      const status = get().saveStatus;
      if (status === "error" || status === "conflict") return;
      set({ saveStatus: "dirty" }); if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; void get().flushSave(); }, 1000);
    },
    flushSave: async () => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (saving) return saving;
      if (!queued || !get().positionLoaded || ["error", "conflict"].includes(get().saveStatus)) return;
      const generation = bookGeneration, bookId = get().bookId!;
      const work = (async () => {
        while (queued && active(generation)) {
          const target = queued; queued = null; set({ saveStatus: "saving" });
          try {
            const position = await saveReaderPosition(bookId, { ...target, expectedRevision: get().position?.revision ?? 0 }, bookAbort.signal);
            if (!active(generation)) return;
            set({ position, saveStatus: queued ? "dirty" : "saved", saveError: null });
            if (position.readingProgress) publishConfirmedReadingProgress?.(bookId, position.readingProgress);
          } catch (error) {
            if (!active(generation)) return;
            if (typeof error === "object" && error !== null && "code" in error && error.code === "READER_CONTENT_CHANGED") {
              await recoverContentChange(target.sectionId, generation); return;
            }
            queued ??= target;
            const conflict = typeof error === "object" && error !== null && "code" in error && error.code === "READER_POSITION_CONFLICT";
            set({ saveStatus: conflict ? "conflict" : "error", saveError: message(error) }); return;
          }
        }
      })().finally(() => { if (saving === work) saving = null; });
      saving = work; return work;
    },
    retrySave: async () => {
      const bookId = get().bookId; if (!bookId) return;
      const generation = bookGeneration;
      try {
        const position = await getReaderPosition(bookId, bookAbort.signal);
        if (!active(generation)) return;
        const currentWindow = get().windows.find(w => w.sectionId === get().sectionId);
        if (staleContent && currentWindow && get().sectionId && !get().preview) {
          queued = { sectionId: get().sectionId!, offset: 0, contentHash: currentWindow.contentHash };
          staleContent = false;
        }
        set({ position, positionLoaded: true, saveStatus: queued ? "dirty" : "saved", saveError: null });
        await get().flushSave();
      } catch (error) { if (active(generation)) set({ saveStatus: "error", saveError: message(error) }); }
    },
    clearPrivateState: () => {
      bookGeneration++; sectionGeneration++; bookAbort.abort(); sectionAbort.abort();
      bookAbort = new AbortController(); sectionAbort = new AbortController(); pending.clear();
      if (timer) clearTimeout(timer); timer = null; positionPending = null; opening = null; saving = null; queued = null; readingAnchor = null; failedWindow = null; failedJump = null; staleContent = false;
      set(empty());
    },
  };
});
useAuthStore.subscribe((state, previous) => { if (state.authGeneration !== previous.authGeneration) useReaderStore.getState().clearPrivateState(); });
