import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useReaderStore } from "@/store/useReaderStore";
import { useReadingPreferencesStore } from "@/store/useReadingPreferencesStore";
import { measureReadingPosition, restoreReadingOffset } from "@/lib/reader-text-position";

export function useReaderWindows(root: RefObject<HTMLDivElement | null>, body: RefObject<HTMLDivElement | null>) {
  const windows = useReaderStore(s => s.windows);
  const restoreVersion = useReaderStore(s => s.restoreVersion);
  const sectionId = useReaderStore(s => s.sectionId);
  const fontSize = useReadingPreferencesStore(s => s.fontSizePx);
  const lineHeight = useReadingPreferencesStore(s => s.lineHeight);
  const width = useReadingPreferencesStore(s => s.widthPx);
  const anchor = useRef<{ sectionId: string; offset: number; topGap: number | null } | null>(null), suppressed = useRef(true), user = useRef(false);
  const frame = useRef(0), releaseFrame = useRef(0), direction = useRef<"next" | "previous">("next");
  const previousTop = useRef(0), previousVersion = useRef(-1);
  const restore = useCallback((element: HTMLElement) => {
    suppressed.current = true;
    const point = anchor.current;
    if (point) {
      if (point.offset === 0 && point.topGap === null) {
        const chapter = [...element.querySelectorAll<HTMLElement>("[data-reader-chapter]")].find(chapter => chapter.dataset.readerChapter === point.sectionId);
        if (chapter) element.scrollTop = Math.max(0, element.scrollTop + chapter.getBoundingClientRect().top - element.getBoundingClientRect().top - 32);
        point.topGap = measureReadingPosition(element)?.topGap ?? 16;
      } else restoreReadingOffset(element, point.offset, point.sectionId, point.topGap ?? 16);
    }
    previousTop.current = element.scrollTop;
    cancelAnimationFrame(releaseFrame.current);
    releaseFrame.current = requestAnimationFrame(() => { releaseFrame.current = requestAnimationFrame(() => { suppressed.current = false; }); });
  }, []);
  const measureSpacers = useCallback((element: HTMLElement, content: HTMLElement) => {
    const current = useReaderStore.getState().windows;
    const density = (id: string) => {
      const height = [...content.querySelectorAll<HTMLElement>("[data-reader-window]")].filter(item => item.dataset.readerSection === id).reduce((sum, item) => sum + item.getBoundingClientRect().height, 0);
      const chars = current.filter(w => w.sectionId === id).reduce((sum, w) => sum + w.text.length, 0);
      return height > 0 && chars > 0 ? height / chars : 1.2;
    };
    const before = content.querySelector<HTMLElement>('[data-reader-spacer="before"]'), after = content.querySelector<HTMLElement>('[data-reader-spacer="after"]');
    if (before) before.style.height = `${current[0] ? current[0].startOffset * density(current[0].sectionId) : 0}px`;
    const last = current[current.length - 1];
    if (after) after.style.height = `${last ? (last.totalLength - last.endOffset) * density(last.sectionId) : 0}px`;
    restore(element);
  }, [restore]);
  useLayoutEffect(() => {
    if (previousVersion.current !== restoreVersion) {
      const state = useReaderStore.getState();
      anchor.current = state.sectionId ? { sectionId: state.sectionId, offset: state.anchorOffset, topGap: state.anchorOffset === 0 ? null : 16 } : null;
      previousVersion.current = restoreVersion; user.current = false;
    }
    if (!windows.length || !body.current || !root.current) return;
    measureSpacers(root.current, body.current);
  }, [windows, restoreVersion, fontSize, lineHeight, width, body, root, measureSpacers]);
  useEffect(() => {
    const element = root.current; if (!element) return;
    const intent = () => { user.current = true; };
    const scroll = () => {
      if (suppressed.current) return;
      direction.current = element.scrollTop >= previousTop.current ? "next" : "previous"; previousTop.current = element.scrollTop;
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const point = measureReadingPosition(element);
        if (point) {
          anchor.current = point;
          if (user.current) useReaderStore.getState().recordVisibleOffset(point.offset, point.sectionId);
          const edge = body.current?.querySelector<HTMLElement>(`[data-reader-edge="${direction.current}"]`);
          const bounds = element.getBoundingClientRect(), box = edge?.getBoundingClientRect();
          if (box && box.top < bounds.bottom + element.clientHeight && box.bottom > bounds.top - element.clientHeight) void useReaderStore.getState().loadAdjacent(direction.current);
        }
        else {
          const before = body.current?.querySelector<HTMLElement>('[data-reader-spacer="before"]');
          const after = body.current?.querySelector<HTMLElement>('[data-reader-spacer="after"]');
          const first = useReaderStore.getState().windows[0];
          const last = useReaderStore.getState().windows.slice(-1)[0];
          const top = element.getBoundingClientRect().top + 16;
          if (first && before && before.getBoundingClientRect().height > 0 && top < before.getBoundingClientRect().bottom) {
            const box = before.getBoundingClientRect();
            const target = Math.min(first.startOffset - 1, Math.max(0, Math.round((top - box.top) / box.height * first.startOffset)));
            void useReaderStore.getState().jumpToOffset(target, user.current, first.sectionId);
          } else if (last && after && after.getBoundingClientRect().height > 0 && top > after.getBoundingClientRect().top) {
            const box = after.getBoundingClientRect();
            const target = Math.min(last.totalLength - 1, Math.max(last.endOffset, last.endOffset + Math.round((top - box.top) / box.height * (last.totalLength - last.endOffset))));
            void useReaderStore.getState().jumpToOffset(target, user.current, last.sectionId);
          }
        }
      });
    };
    element.addEventListener("scroll", scroll, { passive: true });
    for (const name of ["wheel", "touchstart", "pointerdown", "keydown"]) element.addEventListener(name, intent, { passive: true });
    let previousWidth = element.clientWidth;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      if (element.clientWidth !== previousWidth) { previousWidth = element.clientWidth; if (body.current) measureSpacers(element, body.current); }
    });
    observer?.observe(element);
    return () => {
      observer?.disconnect(); element.removeEventListener("scroll", scroll);
      for (const name of ["wheel", "touchstart", "pointerdown", "keydown"]) element.removeEventListener(name, intent);
      cancelAnimationFrame(frame.current); cancelAnimationFrame(releaseFrame.current);
    };
  }, [root, body, measureSpacers]);
  useEffect(() => {
    if (!root.current || !body.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        const edge = (entry.target as HTMLElement).dataset.readerEdge as "next" | "previous";
        if (edge === "next" || direction.current === "previous") void useReaderStore.getState().loadAdjacent(edge);
      }
    }, { root: root.current, rootMargin: "100% 0px", threshold: 0 });
    body.current.querySelectorAll("[data-reader-edge]").forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [windows, sectionId, root, body]);
}
