import { useEffect, useRef } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { useReaderStore } from "@/store/useReaderStore";
export function ReaderChapterList({ onSelect }: { onSelect?: () => void }) {
  const sections = useReaderStore(s => s.sections), sectionId = useReaderStore(s => s.sectionId);
  const selected = useRef<HTMLButtonElement>(null);
  useEffect(() => { selected.current?.scrollIntoView?.({ block: "nearest" }); }, [sectionId]);
  return <nav aria-label="小说章节" className="reader-contents-list">{sections.map(section => <button type="button" ref={sectionId === section.id ? selected : undefined} key={section.id} aria-current={sectionId === section.id ? "location" : undefined} onClick={() => { onSelect?.(); void useReaderStore.getState().previewSection(section.id); }}><span className="reader-contents-order">{String(section.order).padStart(2, "0")}</span><span className="reader-contents-title">{section.title}</span>{sectionId === section.id && <span className="reader-contents-active" aria-label="当前章节">阅读中</span>}</button>)}</nav>;
}
export function ReaderContents({ onClose, open = true }: { onClose: () => void; open?: boolean }) {
  return <Dialog title="目录" open={open} onClose={onClose} className="reader-contents-dialog">
    <p className="dialog-intro">先看看这一章，续读位置会为你保留。</p>
    <ReaderChapterList onSelect={onClose} />
  </Dialog>;
}

