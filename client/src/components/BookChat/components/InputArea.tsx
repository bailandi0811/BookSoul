import { useRef, useEffect, useId, useState } from "react";
import {
  ArrowUp,
  Globe2,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Square,
} from "lucide-react";
import { useChatStore } from "@/store/useChatStore";
import { useBooksStore } from "@/store/useBooksStore";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog } from "@/components/ui/Dialog";

export const InputArea = () => {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const optionsButtonRef = useRef<HTMLButtonElement>(null);
  const optionsId = useId();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [spoilerOverride, setSpoilerOverride] = useState(false);
  const [externalResearch, setExternalResearch] = useState(false);
  const [pendingSpoilers, setPendingSpoilers] = useState(false);
  const [pendingResearch, setPendingResearch] = useState(false);
  const [retrievalMode, setRetrievalMode] = useState<"quick" | "deep">("quick");
  const [pendingMode, setPendingMode] = useState<"quick" | "deep">("quick");
  const bookId = useChatStore((state) => state.currentBookId);
  const sessionId = useChatStore((state) => state.sessionId);
  const [previousScope, setPreviousScope] = useState({ bookId, sessionId });
  if (
    previousScope.bookId !== bookId ||
    previousScope.sessionId !== sessionId
  ) {
    // Assigning the first session ID continues the draft's conversation.
    const firstSessionCreated =
      previousScope.bookId === bookId &&
      previousScope.sessionId === null &&
      sessionId !== null;
    setPreviousScope({ bookId, sessionId });
    if (!firstSessionCreated) {
      setRetrievalMode("quick");
      setPendingMode("quick");
    }
    setSpoilerOverride(false);
    setExternalResearch(false);
    setPendingSpoilers(false);
    setPendingResearch(false);
    setOptionsOpen(false);
  }
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
    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 160)}px`;
  }, [draftInput]);

  useEffect(() => {
    // Keep the software keyboard closed until a phone reader chooses to write.
    if (window.matchMedia("(min-width: 768px) and (pointer: fine)").matches)
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
    void sendMessage(text, spoilerOverride, externalResearch, retrievalMode);
    setSpoilerOverride(false);
    setExternalResearch(false);
    setOptionsOpen(false);
  };
  const visibleRange =
    readingProgress?.mode === "FINISHED"
      ? "回答范围：全书"
      : `回答范围：第 1—${readingProgress?.spoilerCeiling ?? 1} 节`;

  return (
    <div className="chat-composer-shell">
      <AnimatePresence>
        {lastStopNotice && (
          <motion.div
            role="status"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="composer-notice"
          >
            {lastStopNotice}
          </motion.div>
        )}
      </AnimatePresence>
      <form onSubmit={handleSubmit} className="chat-composer input-glow">
        <textarea
          id="chat-input"
          ref={inputRef}
          placeholder={`向${bookTitle ? `《${bookTitle}》` : "这本书"}提问…`}
          value={draftInput}
          onChange={(event) => setDraftInput(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.nativeEvent.isComposing ||
              event.nativeEvent.keyCode === 229
            )
              return;
            if (event.key === "Enter" && !event.shiftKey) handleSubmit(event);
          }}
          disabled={isLoading}
          rows={1}
          aria-label="输入关于当前书籍的问题"
        />
        {isLoading ? (
          <button
            type="button"
            onClick={stopGenerating}
            className="composer-send composer-stop tap-spring"
            aria-label="停止生成"
          >
            <Square className="h-4 w-4 fill-current" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!draftInput.trim()}
            className="composer-send tap-spring"
            aria-label="发送"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        )}
      </form>
      <div className="composer-toolbar">
        <span
          className={`composer-scope ${spoilerOverride ? "text-destructive" : ""}`}
        >
          {spoilerOverride ? (
            <ShieldAlert size={14} />
          ) : (
            <ShieldCheck size={14} />
          )}
          {spoilerOverride ? "本次可包含后文" : visibleRange}
          {externalResearch && <Globe2 size={14} aria-label="本次允许联网" />}
          {retrievalMode === "deep" && <span> · 深度模式</span>}
        </span>
        <div className="relative">
          <button
            ref={optionsButtonRef}
            type="button"
            aria-expanded={optionsOpen}
            aria-controls={optionsId}
            onClick={() => {
              optionsButtonRef.current?.focus({ preventScroll: true });
              setPendingSpoilers(spoilerOverride);
              setPendingResearch(externalResearch);
              setPendingMode(retrievalMode);
              setOptionsOpen(true);
            }}
            className="composer-options-button"
          >
            <SlidersHorizontal size={14} /> 本次选项
            {(spoilerOverride ||
              externalResearch ||
              retrievalMode === "deep") && (
              <span className="options-active-dot" />
            )}
          </button>
          <Dialog
            open={optionsOpen}
            id={optionsId}
            title="本次提问选项"
            onClose={() => setOptionsOpen(false)}
          >
            <p className="dialog-intro mb-4">
              回答模式在当前会话保持；全书检索与联网授权仅用于下一次提问。
            </p>
            <fieldset disabled={isLoading} className="mb-4">
              <legend className="mb-2 font-medium">回答模式</legend>
              <label className="composer-option">
                <input
                  type="radio"
                  name={`${optionsId}-mode`}
                  value="quick"
                  checked={pendingMode === "quick"}
                  onChange={() => setPendingMode("quick")}
                />
                <span>快速 · 一次混合检索</span>
              </label>
              <label className="composer-option">
                <input
                  type="radio"
                  name={`${optionsId}-mode`}
                  value="deep"
                  checked={pendingMode === "deep"}
                  onChange={() => {
                    setPendingMode("deep");
                  }}
                />
                <span>深度 · 按需检索与工具协作</span>
              </label>
              {pendingMode === "deep" && (
                <p className="text-xs text-muted-foreground">
                  深度模式按需补检，支持本书记忆、授权联网和邮件草稿。
                </p>
              )}
            </fieldset>
            <label className="composer-option">
              <input
                type="checkbox"
                checked={pendingSpoilers}
                disabled={isLoading}
                onChange={(event) => setPendingSpoilers(event.target.checked)}
              />
              <span>
                <span className="block font-medium">本次允许检索全书</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  回答可能包含当前阅读进度之后的情节。
                </span>
              </span>
            </label>
            <label className="composer-option">
              <input
                type="checkbox"
                checked={pendingResearch}
                disabled={isLoading}
                onChange={(event) => setPendingResearch(event.target.checked)}
              />
              <span>
                <span className="block font-medium">允许助手联网</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  每轮最多搜索一次，只发送必要书名和当前问题，不发送小说正文或账号信息。
                </span>
              </span>
            </label>
            <div className="dialog-actions">
              <button
                type="button"
                className="dialog-secondary"
                onClick={() => setOptionsOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="dialog-primary"
                disabled={isLoading}
                onClick={() => {
                  setSpoilerOverride(pendingSpoilers);
                  setExternalResearch(pendingResearch);
                  setRetrievalMode(pendingMode);
                  setOptionsOpen(false);
                }}
              >
                应用到本次提问
              </button>
            </div>
          </Dialog>
        </div>
      </div>
    </div>
  );
};
