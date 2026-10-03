import type { Reference } from "@/store/useChatStore";
import { BookOpen, ArrowRight } from "lucide-react";
import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";

export const ReferenceCard = ({ references }: { references: Reference[] }) => {
  const [open, setOpen] = useState(false);
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
            </article>
          ))}
        </div>
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
