import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BookOpen, Feather, X } from "lucide-react";
import type { Message, Reference } from "@/store/useChatStore";
import { openReferenceInReader } from "@/lib/book-workspace-navigation";
import { ReaderApiError } from "@/lib/book-reader-api";
import { PAPER_EASE, PANEL_DURATION } from "@/lib/ui-motion";

interface SourcePanelProps {
  message?: Message;
  messageKey: string;
  onClose: () => void;
  mobile?: boolean;
  showHeader?: boolean;
}

export function SourcePanel({
  message,
  messageKey,
  onClose,
  mobile = false,
  showHeader = true,
}: SourcePanelProps) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openReference = async (reference: Reference, sectionOnly = false) => {
    const key = `${reference.sectionId}:${reference.chunkId}`;
    if (busyKey) return;
    setBusyKey(key);
    setError(null);
    try {
      await openReferenceInReader(reference, sectionOnly);
      if (mobile) onClose();
    } catch (cause) {
      if (
        cause instanceof ReaderApiError &&
        cause.status === 404 &&
        !sectionOnly
      ) {
        try {
          await openReferenceInReader(reference, true);
          if (mobile) onClose();
          return;
        } catch (fallbackCause) {
          setError(
            fallbackCause instanceof Error
              ? fallbackCause.message
              : "无法打开原文",
          );
          return;
        }
      }
      setError(cause instanceof Error ? cause.message : "无法打开原文");
    } finally {
      setBusyKey(null);
    }
  };

  const references = message?.references ?? [];
  const isLoading = Boolean(message?.isStreaming || message?.isThinking);
  const hasAnswer = message?.role === "assistant";

  return (
    <section className="source-panel" aria-label="原文依据">
      {showHeader && (
        <header className="source-panel-header">
          <div>
            <h2>
              <BookOpen size={25} strokeWidth={1.45} />
              原文依据
            </h2>
            {references.length > 0 && !isLoading && (
              <p>本次回答引用 {references.length} 处</p>
            )}
          </div>
          <button type="button" aria-label="关闭原文依据" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
      )}

      <div className="source-panel-body">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={messageKey}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: PANEL_DURATION, ease: PAPER_EASE }}
            className="source-panel-content"
          >
            {!hasAnswer ? (
              <SourceEmpty />
            ) : references.length > 0 ? (
              <ProgressiveSources
                key={messageKey}
                references={references}
                busyKey={busyKey}
                onOpen={openReference}
              />
            ) : isLoading ? (
              <SourceLoading />
            ) : (
              <div className="source-empty source-empty-no-result">
                <BookOpen size={34} strokeWidth={1.25} />
                <h3>没有可直接引用的原文</h3>
                <p>当前阅读范围内未找到与这次回答直接对应的书摘。</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
        <div className="source-watermark" aria-hidden="true">
          <Feather />
          <BookOpen />
        </div>
      </div>

      {error && (
        <p className="source-panel-error" role="alert">
          {error}
        </p>
      )}
      <footer>仅显示当前阅读范围内的原文</footer>
    </section>
  );
}

function SourceEmpty() {
  return (
    <div className="source-empty">
      <BookOpen size={36} strokeWidth={1.25} />
      <h3>提问后，这里会显示原文依据</h3>
      <p>引用会随当前回答更新</p>
    </div>
  );
}

function SourceLoading() {
  return (
    <div className="source-loading" role="status" aria-label="正在整理原文依据">
      <div />
      <div />
      <div />
    </div>
  );
}

function ProgressiveSources({
  references,
  busyKey,
  onOpen,
}: {
  references: Reference[];
  busyKey: string | null;
  onOpen: (reference: Reference) => Promise<void>;
}) {
  const reducedMotion = useReducedMotion();
  const [visibleCount, setVisibleCount] = useState(() =>
    references.length > 0 ? 1 : 0,
  );

  useEffect(() => {
    if (reducedMotion || visibleCount >= references.length) return;
    const timer = window.setTimeout(
      () => setVisibleCount((count) => Math.min(count + 1, references.length)),
      180,
    );
    return () => window.clearTimeout(timer);
  }, [reducedMotion, references.length, visibleCount]);

  const shownReferences = reducedMotion
    ? references
    : references.slice(0, visibleCount);

  return (
    <div className="source-list" aria-live="polite">
      <AnimatePresence initial={false}>
        {shownReferences.map((reference, index) => {
          const key = `${reference.sectionId}:${reference.chunkId}`;
          return (
            <motion.article
              key={`${key}:${index}`}
              initial={reducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: PANEL_DURATION, ease: PAPER_EASE }}
              className="source-item"
            >
              <p className="source-item-location">
                <BookOpen size={15} strokeWidth={1.5} />第 {reference.sectionOrder}{" "}
                节
              </p>
              <h3>{reference.sectionTitle}</h3>
              <blockquote className="font-reading">
                {reference.excerpt}
              </blockquote>
              <button
                type="button"
                disabled={busyKey !== null}
                onClick={() => void onOpen(reference)}
              >
                {busyKey === key ? "正在定位…" : "在正文中查看"}
              </button>
            </motion.article>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
