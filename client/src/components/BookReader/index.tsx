import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Bookmark, ShieldCheck, CloudCheck } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { PAPER_EASE, PANEL_DURATION } from "@/lib/ui-motion";
import { useBooksStore } from "@/store/useBooksStore";
import { useReaderStore } from "@/store/useReaderStore";
import { useChatStore } from "@/store/useChatStore";
import { ReaderBody } from "./components/ReaderBody";
import { ReaderChapterNavigation, ReaderToolbar } from "./components/ReaderToolbar";
import { ReaderContents } from "./components/ReaderContents";
import { ReaderSidebar } from "./components/ReaderSidebar";
const ReaderAssistantPanel = lazy(() => import("./components/ReaderAssistantPanel"));

export default function BookReader() {
  const book = useBooksStore(s => s.currentBook), sections = useBooksStore(s => s.sections);
  const loading = useBooksStore(s => s.isWorkspaceLoading), workspaceError = useBooksStore(s => s.workspaceError);
  const ceiling = useBooksStore(s => s.readingProgress?.spoilerCeiling ?? 1);
  const preview = useReaderStore(s => s.preview), notice = useReaderStore(s => s.notice);
  const readerError = useReaderStore(s => s.error);
  const status = useReaderStore(s => s.saveStatus), error = useReaderStore(s => s.saveError);
  const position = useReaderStore(s => s.position);
  const [assistant, setAssistant] = useState(false);
  const [desktop, setDesktop] = useState(() => window.matchMedia("(min-width: 1024px)").matches);
  const [contents, setContents] = useState(() => window.matchMedia("(min-width: 1280px)").matches);
  const assistantButton = useRef<HTMLButtonElement>(null), contentsButton = useRef<HTMLButtonElement>(null);
  const reducedMotion = useReducedMotion();
  const bookId = book?.id;
  useEffect(() => {
    if (bookId && sections.length) void useReaderStore.getState().openReader(bookId, sections);
    return () => { void useReaderStore.getState().flushSave(); };
  }, [bookId, sections]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const changed = () => { setDesktop(media.matches); setContents(false); };
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  useEffect(() => {
    if (!desktop || (!contents && !assistant)) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector('[role="dialog"]')) return;
      if (assistant) { useChatStore.getState().stopGenerating(); setAssistant(false); assistantButton.current?.focus(); }
      else { setContents(false); contentsButton.current?.focus(); }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [desktop, contents, assistant]);
  const close = () => { useChatStore.getState().stopGenerating(); setAssistant(false); requestAnimationFrame(() => assistantButton.current?.focus()); };
  const closeContents = () => { setContents(false); requestAnimationFrame(() => contentsButton.current?.focus()); };
  const toggleAssistant = () => { if (assistant) close(); else { assistantButton.current?.focus(); setContents(false); setAssistant(true); } };
  const toggleContents = () => {
    if (contents) closeContents();
    else { if (assistant) useChatStore.getState().stopGenerating(); setAssistant(false); contentsButton.current?.focus(); setContents(true); }
  };
  const panelMotion = { initial: reducedMotion ? false as const : { opacity: 0, x: 16, y: 6 }, animate: { opacity: 1, x: 0, y: 0 }, exit: { opacity: 0, x: reducedMotion ? 0 : 12, y: 0 }, transition: { duration: reducedMotion ? 0 : PANEL_DURATION, ease: PAPER_EASE } };
  if (!book) return null;
  return <div className="book-reader-page">
    <AppHeader caption="阅读" />
    <main className={`reader-shell ${assistant && desktop ? "reader-assistant-open" : ""}`}>
      <div className="reader-layout">
        {desktop && <ReaderSidebar book={book} contentsOpen={contents} onToggleContents={toggleContents} onCloseContents={closeContents} />}
        <div className="reader-column">
          <div className="reader-topbar">
            <div className="reader-mobile-book-info"><button className="reader-back" aria-label="返回本书空间" onClick={() => void useBooksStore.getState().switchBookView("book")}><ArrowLeft size={16} /></button><p className="reader-book-title font-reading">{book.title}</p></div>
            <ReaderChapterNavigation /><Bookmark size={20} strokeWidth={1.5} className="reader-navigation-mark" aria-hidden="true" />
          </div>
      {(notice || error || readerError || workspaceError || preview) && <div className="reader-status-row">
        {preview && <p>正在临时预览 <button onClick={() => void useReaderStore.getState().returnToReading()}>返回续读处</button><button onClick={() => useReaderStore.getState().continueFromPreview()}>从这里继续阅读</button></p>}
        {notice && <p role="status">{notice}</p>}
        {workspaceError && <p role="alert">{workspaceError}</p>}
        {readerError && <p role="alert">{readerError} <button onClick={() => void useReaderStore.getState().retryWindow()}>重试加载</button></p>}
        {error && <p role="alert">{error} <button onClick={async () => { await useReaderStore.getState().retrySave(); await useReaderStore.getState().openReader(book.id, sections); }}>{status === "conflict" ? "使用本窗口的位置" : "重试同步"}</button></p>}
      </div>}
        <div className="reader-workspace">
          {loading && !sections.length ? <p role="status" className="reader-loading">正在整理目录…</p> : <ReaderBody bookTitle={book.title} />}
        </div>
        <footer className="reader-footer">
          <span className="reader-save-status" role="status"><CloudCheck size={16} strokeWidth={1.5} />{({ saved: position ? "续读位置已同步" : "尚未保存续读位置", dirty: "等待保存…", saving: "保存中…", error: "续读位置未同步", conflict: "其他窗口已更新位置" })[status]}</span>
          <span className="reader-spoiler-scope"><ShieldCheck size={12} />助手讨论至第 {ceiling} 节</span>
        </footer>
        </div>
        <div className="reader-right-column">
          <ReaderToolbar contentsOpen={contents} assistantOpen={assistant} contentsButton={contentsButton} assistantButton={assistantButton} onContents={toggleContents} onAssistant={toggleAssistant} />
          <AnimatePresence>{assistant && <motion.div key="assistant" {...panelMotion} className={desktop ? "reader-assistant-slot" : "reader-assistant-mobile-slot"}><Suspense fallback={<aside className="reader-assistant-panel"><p role="status">正在打开助手…</p><button onClick={close}>关闭</button></aside>}><ReaderAssistantPanel key={book.id} bookId={book.id} onClose={close} /></Suspense></motion.div>}</AnimatePresence>
        </div>
      </div>
    </main>
    <ReaderContents open={!desktop && contents} onClose={closeContents} />
  </div>;
}
