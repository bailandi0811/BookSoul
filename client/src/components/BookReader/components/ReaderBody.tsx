import { memo, useRef } from "react";
import { useReaderStore } from "@/store/useReaderStore";
import { useReadingPreferencesStore } from "@/store/useReadingPreferencesStore";
import { splitReadingParagraphs } from "@/lib/reader-text-position";
import type { ReferenceLocation, SectionWindow } from "@/lib/book-reader-api";
import { useReaderWindows } from "../useReaderWindows";
const WindowText = memo(function WindowText({ window: w, highlight }: { window: SectionWindow; highlight: ReferenceLocation | null }) {
  const reference = highlight?.sectionId === w.sectionId && highlight.contentHash === w.contentHash ? highlight : null;
  return <div data-reader-window={w.startOffset} data-reader-section={w.sectionId} className="reader-window">{splitReadingParagraphs(w.text, w.startOffset).map(part => {
    const start = Math.max(part.startOffset, reference?.startOffset ?? part.endOffset), end = Math.min(part.endOffset, reference?.endOffset ?? part.startOffset);
    return <span key={part.startOffset} data-reader-start={part.startOffset} data-reader-end={part.endOffset}>{end > start ? <>{part.text.slice(0, start - part.startOffset)}<mark>{part.text.slice(start - part.startOffset, end - part.startOffset)}</mark>{part.text.slice(end - part.startOffset)}</> : part.text}</span>;
  })}</div>;
});
export function ReaderBody({ bookTitle = "" }: { bookTitle?: string }) {
  const windows = useReaderStore(s => s.windows), highlight = useReaderStore(s => s.highlight);
  const error = useReaderStore(s => s.error), loading = useReaderStore(s => s.loading);
  const loadingDirection = useReaderStore(s => s.loadingDirection), sections = useReaderStore(s => s.sections);
  const fontSizePx = useReadingPreferencesStore(s => s.fontSizePx), lineHeight = useReadingPreferencesStore(s => s.lineHeight), widthPx = useReadingPreferencesStore(s => s.widthPx);
  const root = useRef<HTMLDivElement>(null), body = useRef<HTMLDivElement>(null);
  useReaderWindows(root, body);
  const chapters: { sectionId: string; windows: SectionWindow[] }[] = [];
  for (const window of windows) {
    const previous = chapters[chapters.length - 1];
    if (previous?.sectionId === window.sectionId) previous.windows.push(window);
    else chapters.push({ sectionId: window.sectionId, windows: [window] });
  }
  const last = windows[windows.length - 1];
  const finished = last?.nextOffset === null && last.sectionId === sections[sections.length - 1]?.id;
  return <div className="reader-scroll" ref={root} tabIndex={0} aria-label={bookTitle ? `${bookTitle}小说正文` : "小说正文"}>
    <div className="reader-paper font-reading" ref={body} style={{ fontSize: fontSizePx, lineHeight, maxWidth: widthPx + 96 }}>
      {loading && !windows.length && <div role="status" className="reader-page-loading"><BookPageSkeleton />正在翻开这一章…</div>}
      <div aria-hidden="true" data-reader-spacer="before" />
      <div data-reader-edge="previous" className="reader-edge" />
      {chapters.map(chapter => <article key={chapter.sectionId} data-reader-chapter={chapter.sectionId} className="reader-chapter">
        {chapter.windows[0].startOffset === 0 && <header className="reader-chapter-heading">
          <p className="reader-chapter-order">第 {chapter.windows[0].sectionOrder} 章</p>
          <h2 className="reader-section-heading">{chapter.windows[0].sectionTitle}</h2>
        </header>}
        {chapter.windows.map(w => <WindowText key={`${w.contentHash}:${w.startOffset}`} window={w} highlight={highlight} />)}
      </article>)}
      <div data-reader-edge="next" className="reader-edge" />
      {error && <div role="alert" className="reader-inline-notice">{error} <button onClick={() => void useReaderStore.getState().retryWindow()}>重试加载</button></div>}
      {loadingDirection === "next" && <p role="status" className="reader-inline-notice reader-loading-more">{last?.nextOffset === null ? "正在衔接下一章…" : "正在加载后文…"}</p>}
      {finished && <div className="reader-section-end"><span aria-hidden="true" /><p>全书完</p><small>故事读完了，随时可以回来重温。</small></div>}
      <div aria-hidden="true" data-reader-spacer="after" />
    </div>
  </div>;
}
function BookPageSkeleton() { return <div className="reader-skeleton" aria-hidden="true"><span /><span /><span /><span /></div>; }
