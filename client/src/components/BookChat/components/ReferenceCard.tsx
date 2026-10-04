import type { Reference } from "@/store/useChatStore";
import { BookOpen, ArrowRight } from "lucide-react";
import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { useBooksStore } from "@/store/useBooksStore";
import { openReferenceInReader } from "@/lib/book-workspace-navigation";
import { ReaderApiError } from "@/lib/book-reader-api";

export const ReferenceCard = ({ references }: { references: Reference[] }) => {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Reference | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<{ reference: Reference; message: string; missing: boolean } | null>(null);
  const jump = async (reference: Reference, sectionOnly = false) => {
    if (busy) return;
    setBusy(true); setFailed(null); setPending(null);
    try { await openReferenceInReader(reference, sectionOnly); setOpen(false); }
    catch (error) { setFailed({ reference, message: error instanceof Error ? error.message : "无法打开原文", missing: error instanceof ReaderApiError && error.status === 404 }); }
    finally { setBusy(false); }
  };
  const requestJump = (reference: Reference) => {
    if (reference.sectionOrder > (useBooksStore.getState().readingProgress?.spoilerCeiling ?? 1)) setPending(reference);
    else void jump(reference);
  };
  if (!references.length) return null;
  const first = references[0];
  return (
    <div className="reference-preview">
      <div className="reference-label">
        <BookOpen size={14} />
        <span>
          引用第 {first.sectionOrder} 节「{first.sectionTitle}」
          {references.length > 1 ? `等 ${references.length} 处` : ""}
        </span>
      </div>
      <blockquote className="font-reading reference-excerpt line-clamp-3">
        {first.excerpt}
      </blockquote>
      <button
        type="button"
        className="reference-open"
        onClick={() => setOpen(true)}
      >
        查看原文引用 <ArrowRight size={13} />
      </button>
      <Dialog open={open} title="原文引用" wide onClose={() => setOpen(false)}>
        <p className="dialog-intro mb-5">仅展示本次回答所引用的可见原文。</p>
        <div className="space-y-4">
          {references.map((reference, index) => (
            <article
              key={`${reference.sectionId}-${index}`}
              className="source-paper"
            >
              <p className="mb-3 text-xs text-muted-foreground">
                第 {reference.sectionOrder} 节 · {reference.sectionTitle}
              </p>
              <blockquote className="font-reading reference-excerpt">
                {reference.excerpt}
              </blockquote>
              <button type="button" className="reference-open mt-3" disabled={busy} onClick={() => requestJump(reference)}>{busy ? "正在定位…" : "阅读这段原文"} <ArrowRight size={13} /></button>
            </article>
          ))}
        </div>
        {pending && <div className="source-paper mt-4"><p className="text-sm">本节超出当前助手讨论范围。打开后可能看到尚未读到的内容；助手范围保持不变。</p><button className="dialog-secondary mt-3" onClick={() => setPending(null)}>取消</button><button className="dialog-primary mt-3 ml-3" onClick={() => void jump(pending)}>仍然阅读原文</button></div>}
        {failed && <p role="alert" className="mt-4 text-sm">{failed.message}{failed.missing && <button className="reference-open" onClick={() => void jump(failed.reference, true)}>尝试打开原章节</button>}</p>}
        <div className="dialog-actions">
          <button
            type="button"
            className="dialog-primary"
            onClick={() => setOpen(false)}
          >
            返回对话
          </button>
        </div>
      </Dialog>
    </div>
  );
};
