import { ThemeToggle } from "@/components/ThemeToggle";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBooksStore } from "@/store/useBooksStore";
import { useChatStore } from "@/store/useChatStore";
import { ArrowLeft, History, PanelLeftClose, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { AssistantSettings } from "./AssistantSettings";
import { BookCover } from "@/components/BookCover";
import { ReadingProgressDialog } from "./ReadingProgressDialog";

export const Sidebar = ({ onClose }: { onClose: () => void }) => {
  const {
    currentBook,
    sections,
    readingProgress,
    workspaceError,
    updateProgress,
    backToLibrary,
  } = useBooksStore();
  const {
    sessions,
    isSessionsLoading,
    sessionId,
    startNewSession,
    loadSession,
    deleteSession,
  } = useChatStore();
  const [pendingDeleteSession, setPendingDeleteSession] = useState<{
    sessionId: string;
    title: string;
  } | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);

  const mode = readingProgress?.mode ?? "NOT_STARTED";
  const currentSectionOrder = readingProgress?.currentSectionOrder ?? 1;
  const totalSections = currentBook?.sectionCount ?? sections.length;
  const progressPercent =
    mode === "FINISHED"
      ? 100
      : mode === "IN_PROGRESS" && totalSections > 0
        ? Math.min(100, Math.round((currentSectionOrder / totalSections) * 100))
        : 0;

  return (
    <div className="workspace-sidebar flex h-full w-full flex-col">
      <div className="sidebar-book-heading">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={backToLibrary}
            className="tap-spring inline-flex min-h-11 items-center gap-2 rounded-lg px-1 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回书架
          </button>
          <button
            type="button"
            onClick={onClose}
            className="tap-spring grid h-11 w-11 place-items-center rounded-xl text-muted-foreground hover:bg-card hover:text-foreground"
            aria-label="关闭侧栏"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
        <div className="current-volume mt-2 flex items-center gap-4">
          <div className="w-[58px] shrink-0">
            <BookCover
              bookId={currentBook?.id ?? "current"}
              title={currentBook?.title ?? "当前书籍"}
              compact
              shared
              bookmarked={mode === "IN_PROGRESS"}
            />
          </div>
          <div className="min-w-0">
            <h2 className="font-reading line-clamp-2 text-xl leading-snug">
              {currentBook?.title ?? "当前书籍"}
            </h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {totalSections} 节 · {progressPercent}%
            </p>
          </div>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 scrollbar-thin">
        <div className="sidebar-sections space-y-4">
          {workspaceError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/8 px-3 py-2 text-xs leading-relaxed text-destructive">
              {workspaceError}
            </div>
          )}

          <section className="progress-card">
            <h3 className="mb-3 text-xs font-semibold text-foreground">
              阅读书签
            </h3>
            <p className="font-display text-2xl mb-3">
              {mode === "FINISHED"
                ? "已读完"
                : mode === "NOT_STARTED"
                  ? "尚未开始"
                  : `第 ${currentSectionOrder} 节`}
              <span className="ml-3 text-xs font-sans text-muted-foreground">
                {progressPercent}%
              </span>
            </p>
            <div className="h-1 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-primary transition-[width]"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground leading-6">
              默认检索第 1—{readingProgress?.spoilerCeiling ?? 1} 节
            </p>
            <button
              type="button"
              className="progress-link"
              onClick={() => setProgressOpen(true)}
            >
              更新阅读进度 <ArrowLeft size={13} className="rotate-180" />
            </button>
          </section>
          <ReadingProgressDialog
            open={progressOpen}
            onClose={() => setProgressOpen(false)}
          />

          <details className="sidebar-directory">
            <summary className="cursor-pointer text-xs text-muted-foreground py-3">
              目录 · {sections.length} 节
            </summary>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold text-foreground">目录</h3>
              <span className="text-[10px] text-muted-foreground">
                {sections.length} 节
              </span>
            </div>
            <div className="max-h-52 space-y-0.5 overflow-y-auto scrollbar-thin">
              {sections.map((section) => {
                const isCurrent =
                  mode === "IN_PROGRESS" &&
                  section.order === currentSectionOrder;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() =>
                      void updateProgress("IN_PROGRESS", section.order)
                    }
                    className={`min-h-11 w-full rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                      isCurrent
                        ? "bg-card font-semibold text-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-card/70 hover:text-foreground"
                    }`}
                  >
                    <span className="mr-2 tabular-nums text-muted-foreground/70">
                      {section.order}
                    </span>
                    {section.title}
                  </button>
                );
              })}
            </div>
          </details>

          <section className="history-section">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <History className="h-3.5 w-3.5" />
                会话
              </h3>
              <button
                type="button"
                onClick={() => void startNewSession()}
                className="tap-spring inline-flex min-h-11 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10"
              >
                <Plus className="h-3.5 w-3.5" />
                新建
              </button>
            </div>
            <div className="space-y-1">
              {isSessionsLoading ? (
                <div className="warm-card h-16 animate-pulse rounded-[16px]" />
              ) : sessions.length === 0 ? (
                <p className="rounded-[16px] border border-dashed border-border bg-card/45 px-3 py-4 text-center text-xs text-muted-foreground">
                  提出第一个问题后，会话会保存在这里。
                </p>
              ) : (
                sessions.map((session) => {
                  const isActive = session.sessionId === sessionId;
                  return (
                    <div
                      key={session.sessionId}
                      className={`group flex items-center gap-2 rounded-[14px] border px-2.5 py-2.5 ${
                        isActive
                          ? "border-border bg-card text-foreground shadow-sm"
                          : "border-transparent text-muted-foreground hover:bg-card/65"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => void loadSession(session.sessionId)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block truncate text-xs font-medium">
                          {session.title}
                        </span>
                        <span className="mt-0.5 block text-[10px] opacity-65">
                          {new Date(session.updatedAt).toLocaleDateString(
                            "zh-CN",
                            {
                              month: "short",
                              day: "numeric",
                            },
                          )}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPendingDeleteSession({
                            sessionId: session.sessionId,
                            title: session.title,
                          })
                        }
                        className="grid h-11 w-11 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`删除会话：${session.title}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </ScrollArea>

      <div className="sidebar-footer">
        <AssistantSettings />
        <p className="sidebar-note">对话与引用仅属于当前这本书</p>
        <div className="flex justify-end">
          <ThemeToggle />
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingDeleteSession}
        title="删除这段会话？"
        description={
          pendingDeleteSession
            ? `「${pendingDeleteSession.title}」会被永久删除。`
            : undefined
        }
        confirmLabel="删除会话"
        tone="danger"
        onCancel={() => setPendingDeleteSession(null)}
        onConfirm={() => {
          if (!pendingDeleteSession) return;
          void deleteSession(pendingDeleteSession.sessionId);
          setPendingDeleteSession(null);
        }}
      />
    </div>
  );
};
