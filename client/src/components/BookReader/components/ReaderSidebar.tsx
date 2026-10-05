import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Bookmark, ChevronRight, List, X } from "lucide-react";
import { BookCover } from "@/components/BookCover";
import type { BookView } from "@/lib/books-api";
import { beginCoverFlightFrom } from "@/lib/book-cover-flight";
import { PAPER_EASE } from "@/lib/ui-motion";
import { useBooksStore } from "@/store/useBooksStore";
import { useReaderStore } from "@/store/useReaderStore";
import { ReaderChapterList } from "./ReaderContents";

function ReaderBookmarkCard() {
  const sections = useReaderStore(s => s.sections), sectionId = useReaderStore(s => s.sectionId);
  const offset = useReaderStore(s => s.visibleOffset), preview = useReaderStore(s => s.preview);
  const position = useReaderStore(s => s.position);
  const section = sections.find(s => s.id === (preview ? position?.sectionId : sectionId));
  const readingOffset = preview ? position?.offset ?? 0 : offset;
  const percent = section?.charCount ? Math.min(100, Math.round(readingOffset / section.charCount * 100)) : 0;
  return <section className="reader-bookmark-card" aria-label="续读位置">
    <Bookmark size={24} strokeWidth={1.4} aria-hidden="true" />
    <div><p>{preview ? "已同步位置" : "续读位置"}</p><strong className="font-reading">{section ? `第 ${section.order} 章` : "尚未开始"}</strong></div>
    <div className="reader-progress" aria-label={`本章已读 ${percent}%`}><span className="reader-progress-track" aria-hidden="true"><span style={{ width: `${percent}%` }} /></span><span>本章 {percent}%</span></div>
  </section>;
}

export function ReaderSidebar({ book, contentsOpen, onToggleContents, onCloseContents }: { book: BookView; contentsOpen: boolean; onToggleContents: () => void; onCloseContents: () => void }) {
  const sections = useReaderStore(s => s.sections), sectionId = useReaderStore(s => s.sectionId);
  const section = sections.find(s => s.id === sectionId);
  const reducedMotion = useReducedMotion();
  const transition = { duration: reducedMotion ? 0 : .24, ease: PAPER_EASE };
  return <aside className="reader-sidebar" aria-label="本书与目录">
    <section className="reader-book-card">
      <div className="reader-book-cover"><BookCover bookId={book.id} title={book.title} slot="reader" /></div>
      <div className="reader-book-details"><h1 className="font-reading">{book.title}</h1>{book.author && <p>{book.author}</p>}<button className="reader-back" onClick={() => { beginCoverFlightFrom(book.id, "reader"); void useBooksStore.getState().switchBookView("book"); }}><ArrowLeft size={15} />本书空间</button></div>
    </section>
    <section className={`reader-directory ${contentsOpen ? "reader-directory-expanded" : ""}`} aria-label="章节目录">
      {contentsOpen ? <div className="reader-directory-heading"><h2 className="font-reading">目录</h2><span className="reader-count-pill">{sections.length} 章</span><button aria-label="关闭目录" onClick={onCloseContents}><X size={16} /></button></div> : <button className="reader-directory-summary" aria-expanded={false} onClick={onToggleContents}><List size={20} /><span>目录</span><small>{section ? `第 ${section.order} 章 / ${sections.length}` : `${sections.length} 章`}</small><ChevronRight size={16} /></button>}
      <AnimatePresence>{contentsOpen && <motion.div key="chapters" className="reader-directory-body" initial={reducedMotion ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reducedMotion ? 0 : -6 }} transition={transition}>
        <ReaderChapterList /><p className="reader-directory-note">浏览目录不会改变续读位置</p>
      </motion.div>}</AnimatePresence>
    </section>
    <ReaderBookmarkCard />
  </aside>;
}
