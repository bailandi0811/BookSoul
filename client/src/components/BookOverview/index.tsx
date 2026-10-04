import { useEffect } from "react";
import { ArrowLeft, BookOpen, MessageSquare, Bookmark, ShieldCheck } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BookCover } from "@/components/BookCover";
import { useBooksStore } from "@/store/useBooksStore";
import { useReaderStore } from "@/store/useReaderStore";
import { preloadReader, preloadChat } from "@/lib/book-page-loaders";

export default function BookOverview() {
  const book = useBooksStore(s => s.currentBook);
  const sections = useBooksStore(s => s.sections);
  const progress = useBooksStore(s => s.readingProgress);
  const loading = useBooksStore(s => s.isWorkspaceLoading);
  const error = useBooksStore(s => s.workspaceError);
  const position = useReaderStore(s => s.position);
  const saveError = useReaderStore(s => s.saveError);
  const bookId = book?.id;
  useEffect(() => { if (bookId) void useReaderStore.getState().loadPosition(bookId); }, [bookId]);
  if (!book) return null;
  const section = sections.find(s => s.id === position?.sectionId);
  return <div className="book-space-page">
    <AppHeader caption="本书空间" />
    <main className="book-space-main">
      <button className="reader-back" onClick={() => useBooksStore.getState().backToLibrary()}><ArrowLeft size={16} /> 我的书库</button>
      <div className="book-space-heading"><h1 className="font-reading">本书空间</h1><p>接着读，也可以聊聊这本书。</p></div>
      <article className="book-space-volume">
        <div className="book-space-cover"><BookCover bookId={book.id} title={book.title} /></div>
        <div className="book-space-details">
          <p className="reader-eyebrow">{book.visibility === "SYSTEM" ? "系统藏书" : "私人藏书"} · {book.sectionCount} 节</p>
          <h2 className="font-reading">{book.title}</h2>
          {book.author && <p className="book-space-author">{book.author}</p>}
          <div className="book-space-bookmarks">
            <p><Bookmark size={16} />{section ? `续读至第 ${section.order} 节 · ${section.title}` : "从第一页开始阅读"}</p>
            <p><ShieldCheck size={16} /> 助手{progress?.mode === "FINISHED" ? "可讨论全书" : `讨论至第 ${progress?.spoilerCeiling ?? 1} 节`}</p>
          </div>
          <div className="book-space-actions">
            <button className="dialog-primary" disabled={loading || !!error} onPointerEnter={preloadReader} onFocus={preloadReader} onClick={() => void useBooksStore.getState().switchBookView("reader")}><BookOpen size={18} />{position ? "继续阅读" : "开始阅读"}</button>
            <button className="dialog-secondary" disabled={loading || !!error} onPointerEnter={preloadChat} onFocus={preloadChat} onClick={() => void useBooksStore.getState().switchBookView("workspace")}><MessageSquare size={18} />进入聊天</button>
          </div>
          {loading && <p role="status">正在整理本书信息…</p>}
          {error && <p role="alert">{error} <button onClick={() => void useBooksStore.getState().openBook(book.id, "book")}>重试</button></p>}
          {saveError && <p role="alert">{saveError} <button onClick={() => void useReaderStore.getState().retrySave()}>重试读取</button></p>}
        </div>
      </article>
      <p className="book-space-note">续读位置与助手的讨论范围分别保存。阅读时可以随时打开助手面板。</p>
    </main>
  </div>;
}
