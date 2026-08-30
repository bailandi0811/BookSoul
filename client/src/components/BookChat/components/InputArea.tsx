import { useRef, useEffect, useState } from "react";
import { Globe2, Send, ShieldAlert, Square } from "lucide-react";
import { useChatStore } from "@/store/useChatStore";
import { useBooksStore } from "@/store/useBooksStore";
import { motion, AnimatePresence } from "framer-motion";

export const InputArea = () => {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [spoilerOverride, setSpoilerOverride] = useState(false);
  const [externalResearch, setExternalResearch] = useState(false);
  const bookTitle = useBooksStore((state) => state.currentBook?.title);
  const readingProgress = useBooksStore((state) => state.readingProgress);
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
    void sendMessage(text, spoilerOverride, externalResearch);
    setSpoilerOverride(false);
    setExternalResearch(false);
    if (inputRef.current) inputRef.current.style.height = "auto";
  };

  const canSend = draftInput.trim().length > 0 && !isLoading;
  const visibleRange =
    readingProgress?.mode === "FINISHED"
      ? "回答范围 · 全书"
      : readingProgress?.mode === "IN_PROGRESS"
        ? `回答范围 · 第 1—${readingProgress.spoilerCeiling} 节`
        : "回答范围 · 第一节";

  return (
    <div className="relative z-20">
      <div className="mx-auto max-w-[58rem] px-4 pb-4 sm:px-6 sm:pb-5 lg:px-8">
        <AnimatePresence>
          {lastStopNotice && (
            <motion.div
              role="status"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="warm-card mb-3 rounded-xl px-3.5 py-2 text-center text-xs text-muted-foreground"
            >
              {lastStopNotice}
            </motion.div>
          )}
        </AnimatePresence>

        <form
          onSubmit={handleSubmit}
          className="warm-card-raised rounded-[24px] p-3 sm:p-4"
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

          <div className="mt-2 flex items-center justify-between gap-3 border-t border-border/75 pt-3">
            <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-0.5">
              <label
                className={`tap-spring flex min-w-0 shrink-0 cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors focus-within:ring-2 focus-within:ring-primary/30 ${
                  spoilerOverride
                    ? "bg-primary/12 text-primary"
                    : "warm-inset text-muted-foreground hover:text-foreground"
                }`}
                title="开启后，这一次问题可以越过当前阅读进度检索全书"
              >
                <input
                  type="checkbox"
                  checked={spoilerOverride}
                  onChange={(event) => setSpoilerOverride(event.target.checked)}
                  className="sr-only"
                />
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {spoilerOverride ? "本次允许检索全书" : visibleRange}
                </span>
              </label>

              <label
                className={`tap-spring flex shrink-0 cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors focus-within:ring-2 focus-within:ring-primary/30 ${
                  externalResearch
                    ? "bg-primary/12 text-primary"
                    : "warm-inset text-muted-foreground hover:text-foreground"
                }`}
                title="开启后，本次问题和必要书名会发送给外部搜索服务，不会发送小说正文、笔记或账号信息"
              >
                <input
                  type="checkbox"
                  checked={externalResearch}
                  onChange={(event) =>
                    setExternalResearch(event.target.checked)
                  }
                  className="sr-only"
                />
                <Globe2 className="h-3.5 w-3.5 shrink-0" />
                <span>{externalResearch ? "本次联网" : "联网资料"}</span>
              </label>
            </div>

            {isLoading ? (
              <button
                type="button"
                onClick={stopGenerating}
                className="tap-spring flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-secondary text-muted-foreground"
                aria-label="停止生成"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSend}
                className="tap-spring flex h-10 items-center gap-2 whitespace-nowrap rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_10px_24px_-16px_rgb(var(--primary)/0.9)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                发送
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
        </form>
        <p className="mt-2 text-center text-[11px] text-muted-foreground/75">
          {externalResearch
            ? "本次会将问题和必要书名发送给外部搜索服务"
            : "小说事实以当前书籍和阅读进度内的引用为准"}
        </p>
      </div>
    </div>
  );
};
