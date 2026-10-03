import { useCallback, useEffect, useRef, useState } from "react";
import { useChatStore } from "@/store/useChatStore";
import { useBooksStore } from "@/store/useBooksStore";
import {
  ArrowDown,
  BookOpen,
  PanelLeftOpen,
  Users,
  Route,
  Search,
  ShieldCheck,
} from "lucide-react";
import { BookCover } from "@/components/BookCover";
import { AppHeader } from "@/components/AppHeader";
import { motion, AnimatePresence } from "framer-motion";
import { MessageBubble } from "./components/MessageBubble";
import { InputArea } from "./components/InputArea";
import { Sidebar } from "./components/Sidebar";
import { AssistantSettings } from "./components/AssistantSettings";
import { EmailComposerDialog } from "./components/EmailComposerDialog";

const SIDEBAR_WIDTH_KEY = "booksoul_sidebar_width";
const SIDEBAR_MIN = 232;
const SIDEBAR_MAX = 340;

function defaultSidebarWidth() {
  return 246;
}

function readSidebarWidth() {
  if (typeof localStorage === "undefined") return defaultSidebarWidth();
  let saved: string | null;
  try {
    saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
  } catch {
    return defaultSidebarWidth();
  }
  if (saved === null) return defaultSidebarWidth();
  const raw = Number(saved);
  if (!Number.isFinite(raw)) return defaultSidebarWidth();
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, raw));
}

const SUGGESTIONS = [
  {
    title: "梳理人物与关系",
    description: "把已读内容里的人物放在一起看。",
    prompt: "帮我梳理目前出现的主要人物和关系",
    icon: Users,
  },
  {
    title: "回顾已读情节",
    description: "想一想，故事走到了哪里。",
    prompt: "总结我已读范围内的重要情节",
    icon: Route,
  },
  {
    title: "看看被忽略的线索",
    description: "从已出现的原文中寻找依据。",
    prompt: "有哪些容易忽略的细节或伏笔？",
    icon: Search,
  },
];

export default function BookChat() {
  const messages = useChatStore((state) => state.messages);
  const isLoading = useChatStore((state) => state.isLoading);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const pendingEmailDraft = useChatStore((state) => state.pendingEmailDraft);
  const closeEmailDraft = useChatStore((state) => state.closeEmailDraft);
  const currentBook = useBooksStore((state) => state.currentBook);
  const assistant = useBooksStore((state) => state.assistant);
  const readingProgress = useBooksStore((state) => state.readingProgress);
  const isWorkspaceLoading = useBooksStore((state) => state.isWorkspaceLoading);
  const workspaceError = useBooksStore((state) => state.workspaceError);
  const backToLibrary = useBooksStore((state) => state.backToLibrary);
  const viewportRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const followingLatest = useRef(true);
  const lastUserMessage = useRef<(typeof messages)[number] | undefined>(
    undefined,
  );
  const [showLatest, setShowLatest] = useState(false);
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
    const update = () => {
      setIsDesktop(media.matches);
      setIsSidebarOpen(media.matches);
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    let userMessage: (typeof messages)[number] | undefined;
    for (let index = messages.length - 1; index >= 0; index--) {
      if (messages[index].role === "user") {
        userMessage = messages[index];
        break;
      }
    }
    if (userMessage !== lastUserMessage.current) followingLatest.current = true;
    lastUserMessage.current = userMessage;
    if (followingLatest.current && viewportRef.current)
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
  }, [messages, isLoading]);

  useEffect(() => {
    if (!isSidebarOpen || isDesktop) return;
    const previousFocus = document.activeElement;
    const panel = sidebarRef.current;
    panel?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      // A confirmation dialog above the drawer owns keyboard input until closed.
      if (
        [
          ...document.querySelectorAll('[role="dialog"][aria-modal="true"]'),
        ].some((dialog) => dialog !== panel && !panel?.contains(dialog))
      )
        return;
      if (event.key === "Escape") {
        setIsSidebarOpen(false);
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const controls = [
        ...panel.querySelectorAll<HTMLElement>(
          'button, select, input, textarea, summary, [tabindex="0"]',
        ),
      ].filter(
        (control) =>
          !control.matches(":disabled") &&
          control.tabIndex >= 0 &&
          control.getClientRects().length > 0,
      );
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, [isSidebarOpen, isDesktop]);

  const onResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);
      setIsResizing(true);
      const onMove = (moveEvent: PointerEvent) => {
        const next = Math.min(
          SIDEBAR_MAX,
          Math.max(
            SIDEBAR_MIN,
            moveEvent.clientX -
              (layoutRef.current?.getBoundingClientRect().left ?? 0),
          ),
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
    <div className="workspace-page text-foreground">
      <div inert={isSidebarOpen && !isDesktop}>
        <AppHeader caption="阅读助手" />
      </div>
      <div className="workspace-layout" ref={layoutRef}>
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
              ref={sidebarRef}
              role={isDesktop ? undefined : "dialog"}
              aria-modal={isDesktop ? undefined : true}
              aria-label={isDesktop ? undefined : "书籍导航"}
              initial={isDesktop ? { width: 0, opacity: 0 } : { x: "-100%" }}
              animate={
                isDesktop ? { width: sidebarWidth, opacity: 1 } : { x: 0 }
              }
              exit={isDesktop ? { width: 0, opacity: 0 } : { x: "-100%" }}
              transition={
                isResizing
                  ? { duration: 0 }
                  : { duration: 0.2, ease: [0.4, 0, 0.2, 1] }
              }
              className="workspace-sidebar-panel fixed inset-y-0 left-0 z-30 h-full w-[min(84vw,296px)] shrink-0 overflow-hidden md:relative md:w-auto"
            >
              <div
                className="h-full w-[min(84vw,296px)] overflow-hidden md:w-auto"
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
                tabIndex={isDesktop ? 0 : -1}
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

        <div
          inert={isSidebarOpen && !isDesktop}
          className="conversation-surface relative flex h-full min-w-0 flex-1 flex-col"
        >
          <header className="conversation-top relative z-10 flex items-center justify-between border-b border-border/75 px-3 sm:px-5 lg:px-7">
            <div className="flex min-w-0 items-center gap-3">
              {(!isSidebarOpen || !isDesktop) && (
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(true)}
                  className="tap-spring grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground"
                  aria-label="打开侧栏"
                >
                  <PanelLeftOpen className="h-5 w-5" />
                </button>
              )}
              <div className="min-w-0">
                <h1 className="font-reading truncate text-base font-semibold">
                  {currentBook.title}
                </h1>
                <p className="truncate text-[10px] text-muted-foreground mt-1">
                  {assistant?.name ?? "阅读助手"}
                </p>
              </div>
            </div>
            <div className="conversation-tools">
              <span className="conversation-range">
                <ShieldCheck size={14} strokeWidth={1.5} />
                {readingProgress?.mode === "FINISHED"
                  ? "已读全书"
                  : `第 1—${readingProgress?.spoilerCeiling ?? 1} 节`}
              </span>
              <AssistantSettings compact />
            </div>
          </header>

          <div className="relative flex-1 overflow-hidden">
            {isWorkspaceLoading ? (
              <div className="mx-auto max-w-[58rem] space-y-4 px-4 py-8 sm:px-6 lg:px-8">
                <div className="warm-inset h-24 animate-pulse rounded-[20px]" />
                <div className="warm-card h-36 animate-pulse rounded-[24px]" />
              </div>
            ) : (
              <div
                ref={viewportRef}
                role="log"
                aria-label="书籍对话"
                aria-live="off"
                className="chat-viewport h-full chat-scrollbar"
                onScroll={(event) => {
                  const viewport = event.currentTarget;
                  const nearBottom =
                    viewport.scrollHeight -
                      viewport.scrollTop -
                      viewport.clientHeight <
                    80;
                  followingLatest.current = nearBottom;
                  setShowLatest(!nearBottom);
                }}
              >
                <div className="chat-content">
                  {messages.length === 0 && !isLoading ? (
                    <div className="assistant-welcome-layout">
                      <div className="assistant-welcome w-full">
                        <div className="welcome-volume">
                          <div className="assistant-welcome-cover">
                            <BookCover
                              bookId={currentBook.id}
                              title={currentBook.title}
                            />
                          </div>
                          <div>
                            <h2 className="font-reading mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">
                              从你的书签聊起
                            </h2>
                            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                              关于人物、情节，或某个让你停下来的句子。
                              从读到的地方开始，慢慢聊。
                            </p>
                          </div>
                        </div>
                        <p className="welcome-heading">可以从这些问题开始</p>
                        <div className="assistant-prompts">
                          {SUGGESTIONS.map(
                            ({ title, description, prompt, icon: Icon }) => (
                              <button
                                key={title}
                                type="button"
                                disabled={isLoading}
                                onClick={() => void sendMessage(prompt)}
                                className="tap-spring"
                              >
                                <Icon size={22} strokeWidth={1.25} />
                                <span>
                                  <span className="prompt-title">{title}</span>
                                  <span className="prompt-description">
                                    {description}
                                  </span>
                                </span>
                              </button>
                            ),
                          )}
                        </div>
                        <p className="welcome-footnote">
                          <ShieldCheck size={13} strokeWidth={1.5} />
                          <span>
                            默认只聊已读范围，原文引用会附在回答里。阅读进度更新后，助手也会跟着你的书签往前走。
                          </span>
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-9 pb-4">
                      <AnimatePresence initial={false}>
                        {messages.map((message, index) => (
                          <MessageBubble
                            key={`${message.createdAt ?? index}-${index}`}
                            message={message}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {showLatest && (
            <button
              type="button"
              aria-label="回到最新回复"
              className="jump-to-latest inline-flex items-center gap-2"
              onClick={() => {
                followingLatest.current = true;
                setShowLatest(false);
                if (viewportRef.current)
                  viewportRef.current.scrollTop =
                    viewportRef.current.scrollHeight;
              }}
            >
              <ArrowDown size={14} /> 最新回复
            </button>
          )}
          <div className="relative z-10 bg-card">
            <InputArea key={currentBook.id} />
          </div>
        </div>
        <EmailComposerDialog
          draft={pendingEmailDraft}
          onClose={closeEmailDraft}
        />
      </div>
    </div>
  );
}
