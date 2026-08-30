import { useCallback, useEffect, useRef, useState } from "react";
import { useChatStore } from "@/store/useChatStore";
import { useBooksStore } from "@/store/useBooksStore";
import { BookOpen, PanelLeftOpen, Plus, ShieldCheck } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion, AnimatePresence } from "framer-motion";
import { MessageBubble } from "./components/MessageBubble";
import { InputArea } from "./components/InputArea";
import { Sidebar } from "./components/Sidebar";
import { EmailComposerDialog } from "./components/EmailComposerDialog";

const SIDEBAR_WIDTH_KEY = "booksoul_sidebar_width";
const SIDEBAR_MIN = 280;
const SIDEBAR_MAX = 420;

function defaultSidebarWidth() {
  if (typeof window === "undefined") return 300;
  return Math.min(
    SIDEBAR_MAX,
    Math.max(SIDEBAR_MIN, Math.round(window.innerWidth * 0.22)),
  );
}

function readSidebarWidth() {
  if (typeof localStorage === "undefined") return defaultSidebarWidth();
  const raw = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
  if (!Number.isFinite(raw)) return defaultSidebarWidth();
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, raw));
}

const SUGGESTIONS = [
  "帮我梳理目前出现的主要人物和关系",
  "总结我已读范围内的重要情节",
  "有哪些容易忽略的细节或伏笔？",
];

export default function BookChat() {
  const messages = useChatStore((state) => state.messages);
  const isLoading = useChatStore((state) => state.isLoading);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const startNewSession = useChatStore((state) => state.startNewSession);
  const pendingEmailDraft = useChatStore((state) => state.pendingEmailDraft);
  const closeEmailDraft = useChatStore((state) => state.closeEmailDraft);
  const currentBook = useBooksStore((state) => state.currentBook);
  const assistant = useBooksStore((state) => state.assistant);
  const readingProgress = useBooksStore((state) => state.readingProgress);
  const isWorkspaceLoading = useBooksStore((state) => state.isWorkspaceLoading);
  const workspaceError = useBooksStore((state) => state.workspaceError);
  const backToLibrary = useBooksStore((state) => state.backToLibrary);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === "undefined"
      ? true
      : window.matchMedia("(min-width: 768px)").matches,
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(() =>
    typeof window === "undefined"
      ? true
      : window.matchMedia("(min-width: 768px)").matches,
  );
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarWidthRef = useRef(sidebarWidth);

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    messagesEndRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [messages, isLoading]);

  const onResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);
      setIsResizing(true);
      const onMove = (moveEvent: PointerEvent) => {
        const next = Math.min(
          SIDEBAR_MAX,
          Math.max(SIDEBAR_MIN, moveEvent.clientX),
        );
        sidebarWidthRef.current = next;
        setSidebarWidth(next);
      };
      const onUp = (upEvent: PointerEvent) => {
        try {
          handle.releasePointerCapture(upEvent.pointerId);
        } catch {
          // Pointer capture may already be released.
        }
        setIsResizing(false);
        localStorage.setItem(
          SIDEBAR_WIDTH_KEY,
          String(sidebarWidthRef.current),
        );
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onUp);
    },
    [],
  );

  if (!currentBook) return null;

  if (workspaceError && !assistant && !isWorkspaceLoading) {
    return (
      <div className="paper-atmosphere grid min-h-[100dvh] place-items-center px-6 text-center">
        <div className="warm-card-raised max-w-md rounded-[24px] p-8">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-[16px] bg-destructive/10 text-destructive">
            <BookOpen className="h-5 w-5" />
          </span>
          <h1 className="mt-4 text-xl font-semibold">工作区没有加载完成</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {workspaceError}
          </p>
          <button
            type="button"
            onClick={backToLibrary}
            className="tap-spring mt-6 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            返回书架
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="paper-atmosphere flex h-[100dvh] min-h-[100dvh] overflow-hidden text-foreground">
      <AnimatePresence initial={false}>
        {isSidebarOpen && !isDesktop && (
          <motion.button
            key="sidebar-backdrop"
            type="button"
            aria-label="关闭侧栏"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 z-20 bg-foreground/25 md:hidden"
          />
        )}
        {isSidebarOpen && (
          <motion.div
            key="sidebar-panel"
            initial={isDesktop ? { width: 0, opacity: 0 } : { x: "-100%" }}
            animate={isDesktop ? { width: sidebarWidth, opacity: 1 } : { x: 0 }}
            exit={isDesktop ? { width: 0, opacity: 0 } : { x: "-100%" }}
            transition={
              isResizing
                ? { duration: 0 }
                : { duration: 0.2, ease: [0.4, 0, 0.2, 1] }
            }
            className="fixed inset-y-0 left-0 z-30 h-full w-[min(88vw,360px)] shrink-0 overflow-hidden md:relative md:w-auto"
          >
            <div
              className="h-full w-[min(88vw,360px)] overflow-hidden md:w-auto"
              style={isDesktop ? { width: sidebarWidth } : undefined}
            >
              <Sidebar onClose={() => setIsSidebarOpen(false)} />
            </div>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="调整侧栏宽度"
              aria-valuemin={SIDEBAR_MIN}
              aria-valuemax={SIDEBAR_MAX}
              aria-valuenow={Math.round(sidebarWidth)}
              onPointerDown={onResizePointerDown}
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
                  return;
                event.preventDefault();
                const delta = event.key === "ArrowLeft" ? -16 : 16;
                const next = Math.min(
                  SIDEBAR_MAX,
                  Math.max(SIDEBAR_MIN, sidebarWidth + delta),
                );
                setSidebarWidth(next);
                localStorage.setItem(SIDEBAR_WIDTH_KEY, String(next));
              }}
              className={`absolute right-0 top-0 hidden h-full w-1.5 cursor-col-resize touch-none md:block ${
                isResizing ? "bg-primary/35" : "hover:bg-primary/20"
              }`}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative flex h-full min-w-0 flex-1 flex-col">
        <header className="relative z-10 flex min-h-[4.5rem] items-center justify-between border-b border-border/75 bg-background/95 px-3 sm:px-5 lg:px-7">
          <div className="flex min-w-0 items-center gap-3">
            {!isSidebarOpen && (
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                className="tap-spring rounded-xl p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="打开侧栏"
              >
                <PanelLeftOpen className="h-5 w-5" />
              </button>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold tracking-tight">
                {assistant?.name ?? `《${currentBook.title}》阅读助手`}
              </h1>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3 w-3 text-primary" />
                <span className="truncate">
                  {readingProgress?.mode === "FINISHED"
                    ? "已读完整本书 · 可检索全书"
                    : readingProgress?.mode === "IN_PROGRESS"
                      ? `防剧透范围 · 第 1—${readingProgress.spoilerCeiling} 节`
                      : "防剧透范围 · 第一节"}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void startNewSession(currentBook.id)}
            className="tap-spring warm-card inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-xs font-semibold hover:border-primary/40"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">新对话</span>
          </button>
        </header>

        <div className="relative flex-1 overflow-hidden">
          {isWorkspaceLoading ? (
            <div className="mx-auto max-w-[58rem] space-y-4 px-4 py-8 sm:px-6 lg:px-8">
              <div className="warm-inset h-24 animate-pulse rounded-[20px]" />
              <div className="warm-card h-36 animate-pulse rounded-[24px]" />
            </div>
          ) : (
            <ScrollArea className="h-full chat-scrollbar">
              <div className="mx-auto w-full max-w-[58rem] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
                {messages.length === 0 && !isLoading ? (
                  <div className="flex min-h-[calc(100dvh-13rem)] items-center justify-center py-8">
                    <div className="warm-card-raised w-full rounded-[26px] p-5 sm:p-7">
                      <span className="warm-tint grid h-12 w-12 place-items-center rounded-[16px] text-primary">
                        <BookOpen className="h-5 w-5" />
                      </span>
                      <h2 className="font-reading mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">
                        从已读内容开始聊
                      </h2>
                      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                        你可以问人物、情节、设定和伏笔。需要时，回答会附上章节引用。
                      </p>
                      <div className="warm-inset mt-5 flex items-center gap-3 rounded-[16px] p-3.5">
                        <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold">
                            《{currentBook.title}》
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            默认只基于你的已读范围回答
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                        {SUGGESTIONS.map((suggestion, index) => (
                          <button
                            key={suggestion}
                            type="button"
                            disabled={isLoading}
                            onClick={() => void sendMessage(suggestion)}
                            className={`tap-spring warm-inset rounded-[16px] px-4 py-3.5 text-left text-sm leading-relaxed hover:border-primary/45 hover:bg-primary/5 ${
                              index === 0 ? "sm:col-span-2" : ""
                            }`}
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5 pb-6">
                    <AnimatePresence initial={false}>
                      {messages.map((message, index) => (
                        <MessageBubble
                          key={`${message.createdAt ?? index}-${index}`}
                          message={message}
                        />
                      ))}
                    </AnimatePresence>
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </div>

        <div className="relative z-10 border-t border-border/60 bg-background/94 pt-3">
          <InputArea />
        </div>
      </div>
      {pendingEmailDraft && (
        <EmailComposerDialog
          draft={pendingEmailDraft}
          onClose={closeEmailDraft}
        />
      )}
    </div>
  );
}
