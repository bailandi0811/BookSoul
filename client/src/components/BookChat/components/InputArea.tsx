import { useRef, useEffect, useState } from "react";
import { Send, ShieldAlert, Square } from "lucide-react";
import { useChatStore } from "@/store/useChatStore";
import { useBooksStore } from "@/store/useBooksStore";
import { motion, AnimatePresence } from "framer-motion";

export const InputArea = () => {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [spoilerOverride, setSpoilerOverride] = useState(false);
  const bookTitle = useBooksStore((state) => state.currentBook?.title);
  const {
    isLoading,
    sendMessage,
    stopGenerating,
    draftInput,
    setDraftInput,
    lastStopNotice,
    clearStopNotice,
  } = useChatStore();

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.style.height = "auto";
    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 200)}px`;
  }, [draftInput]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!lastStopNotice) return;
    const timer = window.setTimeout(() => clearStopNotice(), 4_000);
    return () => window.clearTimeout(timer);
  }, [lastStopNotice, clearStopNotice]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draftInput.trim() || isLoading) return;
    const text = draftInput.trim();
    setDraftInput("");
    void sendMessage(text, spoilerOverride);
    setSpoilerOverride(false);
    if (inputRef.current) inputRef.current.style.height = "auto";
  };

  const canSend = draftInput.trim().length > 0 && !isLoading;

  return (
    <div className="relative z-20">
      <div className="mx-auto max-w-[46rem] px-4 pb-4 sm:px-6 sm:pb-5">
        <AnimatePresence>
          {lastStopNotice && (
            <motion.div
              role="status"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="mb-3 rounded-xl border border-border bg-card px-3.5 py-2 text-center text-xs text-muted-foreground"
            >
              {lastStopNotice}
            </motion.div>
          )}
        </AnimatePresence>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-border bg-card p-3 shadow-[0_8px_32px_-20px_rgb(var(--foreground)/0.28)]"
        >
          <textarea
            id="chat-input"
            ref={inputRef}
            placeholder={`向${bookTitle ? `《${bookTitle}》` : "这本书"}提问`}
            value={draftInput}
            onChange={(event) => setDraftInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSubmit(event);
              }
            }}
            disabled={isLoading}
            rows={1}
            aria-label="输入关于当前书籍的问题"
            className="min-h-12 max-h-[200px] w-full resize-none border-0 bg-transparent px-2 py-2 text-[16px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/70 disabled:opacity-50"
          />

          <div className="mt-2 flex items-center justify-between gap-3 border-t border-border/70 pt-3">
            <label className="flex min-w-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={spoilerOverride}
                onChange={(event) => setSpoilerOverride(event.target.checked)}
                className="h-4 w-4 rounded border-border accent-[rgb(var(--primary))]"
              />
              <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">仅本次允许检索全书</span>
            </label>

            {isLoading ? (
              <button
                type="button"
                onClick={stopGenerating}
                className="tap-spring flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-secondary text-muted-foreground"
                aria-label="停止生成"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSend}
                className="tap-spring flex h-9 items-center gap-2 whitespace-nowrap rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                发送
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
        </form>
        <p className="mt-2 text-center text-[11px] text-muted-foreground/70">
          小说事实以当前书籍和阅读进度内的引用为准
        </p>
      </div>
    </div>
  );
};
