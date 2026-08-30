import { AccountSection } from "@/components/auth/AccountSection";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBooksStore } from "@/store/useBooksStore";
import { useChatStore } from "@/store/useChatStore";
import {
  ArrowLeft,
  BookOpen,
  History,
  PanelLeftClose,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { AssistantSettings } from "./AssistantSettings";

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
    <div className="flex h-full w-full flex-col border-r border-border/80 bg-secondary/80">
      <div className="border-b border-border/75 p-4">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={backToLibrary}
            className="tap-spring inline-flex items-center gap-2 rounded-lg px-1 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回书架
          </button>
          <button
            type="button"
            onClick={onClose}
            className="tap-spring rounded-xl p-2 text-muted-foreground hover:bg-card hover:text-foreground"
            aria-label="关闭侧栏"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
        <div className="warm-card mt-4 flex items-center gap-3 rounded-[18px] p-3">
          <span className="grid h-12 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#a85f4b] to-[#744137] text-[#fff2df] shadow-sm">
            <BookOpen className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="font-reading line-clamp-2 text-sm font-semibold leading-snug">
              {currentBook?.title ?? "当前书籍"}
            </h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {totalSections} 节 · {progressPercent}%
            </p>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 scrollbar-thin">
        <div className="space-y-5 p-4">
          {workspaceError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/8 px-3 py-2 text-xs leading-relaxed text-destructive">
              {workspaceError}
            </div>
          )}

          <section>
            <h3 className="mb-3 text-xs font-semibold text-foreground">
              阅读进度
            </h3>
            <div className="warm-card space-y-2.5 rounded-[18px] p-3.5">
              <div
                role="progressbar"
                aria-label="阅读进度"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPercent}
                className="h-1.5 overflow-hidden rounded-full bg-secondary"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <label className="grid gap-1.5 text-[11px] font-medium text-muted-foreground">
                阅读状态
                <select
                  value={mode}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (next === "NOT_STARTED") {
                      void updateProgress("NOT_STARTED");
                    } else if (next === "FINISHED") {
                      void updateProgress("FINISHED");
                    } else {
                      void updateProgress("IN_PROGRESS", currentSectionOrder);
                    }
                  }}
                  className="h-9 rounded-xl border border-input bg-background px-2.5 text-xs text-foreground outline-none focus:border-primary"
                >
                  <option value="NOT_STARTED">尚未开始</option>
                  <option value="IN_PROGRESS">阅读中</option>
                  <option value="FINISHED">已读完</option>
                </select>
              </label>
              {mode === "IN_PROGRESS" && (
                <label className="grid gap-1.5 text-[11px] font-medium text-muted-foreground">
                  当前读到
                  <select
                    value={currentSectionOrder}
                    onChange={(event) =>
                      void updateProgress(
                        "IN_PROGRESS",
                        Number(event.target.value),
                      )
                    }
                    className="h-9 rounded-xl border border-input bg-background px-2.5 text-xs text-foreground outline-none focus:border-primary"
                  >
                    {sections.map((section) => (
                      <option key={section.id} value={section.order}>
                        {section.order}. {section.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                默认只检索第 {readingProgress?.spoilerCeiling ?? 1}{" "}
                节及以前内容。
              </p>
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold text-foreground">目录</h3>
              <span className="text-[10px] text-muted-foreground">
                {sections.length} 节
              </span>
            </div>
            <div className="warm-inset max-h-48 space-y-0.5 overflow-y-auto rounded-[16px] p-1.5 scrollbar-thin">
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
                    className={`w-full rounded-xl px-2.5 py-2 text-left text-xs transition-colors ${
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
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <History className="h-3.5 w-3.5" />
                会话
              </h3>
              <button
                type="button"
                onClick={() => void startNewSession()}
                className="tap-spring inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10"
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
                        className="rounded-md p-1.5 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus:opacity-100"
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

          <AssistantSettings />
        </div>
      </ScrollArea>

      <div className="border-t border-border/75 bg-secondary/90 p-4">
        <div className="mb-3">
          <AccountSection />
        </div>
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
