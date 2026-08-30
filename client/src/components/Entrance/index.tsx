import { AccountSection } from "@/components/auth/AccountSection";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  MAX_BOOK_UPLOAD_MEGABYTES,
  validateBookUpload,
} from "@/lib/book-upload-policy";
import type { BookStatus, BookView } from "@/lib/books-api";
import { useBooksStore } from "@/store/useBooksStore";
import {
  ArrowRight,
  BookOpen,
  FileText,
  Library,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

const PROCESSING_STATUSES: BookStatus[] = [
  "QUEUED",
  "PARSING",
  "CHUNKING",
  "EMBEDDING",
];

const STATUS_LABELS: Record<BookStatus, string> = {
  QUEUED: "等待处理",
  PARSING: "正在解析",
  CHUNKING: "正在整理章节",
  EMBEDDING: "正在建立索引",
  READY: "可以阅读",
  FAILED: "处理失败",
  DELETING: "正在删除",
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function readProgress(book: BookView): string {
  if (!book.readingProgress || book.readingProgress.mode === "NOT_STARTED") {
    return "尚未开始";
  }
  if (book.readingProgress.mode === "FINISHED") return "已读完";
  return `读到第 ${book.readingProgress.currentSectionOrder ?? 1} 节`;
}

export function Entrance() {
  const {
    books,
    isLoading,
    isUploading,
    uploadFileName,
    uploadProgress,
    mutatingBookIds,
    error,
    fetchBooks,
    uploadBook,
    retryBook,
    deleteBook,
    openBook,
  } = useBooksStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<BookView | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    void fetchBooks();
  }, [fetchBooks]);

  const hasProcessingBooks = books.some((book) =>
    PROCESSING_STATUSES.includes(book.status),
  );

  useEffect(() => {
    if (!hasProcessingBooks) return;
    const timer = window.setInterval(() => void fetchBooks(), 3_000);
    return () => window.clearInterval(timer);
  }, [fetchBooks, hasProcessingBooks]);

  const submitFile = async (file: File | undefined) => {
    if (!file || isUploading) return;
    setFileError(null);
    const validationError = validateBookUpload(file);
    if (validationError) {
      setFileError(validationError);
      return;
    }
    await uploadBook(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  const uploadPercent = uploadProgress?.percent ?? 0;

  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <header className="border-b border-border/70 bg-background/95">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Library className="h-4 w-4" />
            </span>
            <div>
              <div className="text-sm font-bold tracking-tight">BookSoul</div>
              <div className="text-[11px] text-muted-foreground">
                私人阅读助手
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:block">
              <AccountSection />
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <section className="grid items-stretch gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="flex flex-col justify-center py-3">
            <p className="mb-3 text-xs font-semibold tracking-wide text-primary">
              你的私人书架
            </p>
            <h1 className="max-w-xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
              把正在读的小说，交给一个懂进度的助手
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground">
              上传小说，按已读章节提问。回答会附原文出处，也不会默认越过你的阅读位置。
            </p>
          </div>

          <motion.label
            whileTap={isUploading ? undefined : { scale: 0.995 }}
            aria-busy={isUploading}
            aria-disabled={isUploading}
            onDragEnter={(event) => {
              event.preventDefault();
              if (isUploading) return;
              setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              if (isUploading) return;
              void submitFile(event.dataTransfer.files[0]);
            }}
            className={`flex min-h-64 flex-col justify-between rounded-2xl border p-6 transition-colors sm:p-7 ${
              isUploading
                ? "cursor-wait border-primary/45 bg-primary/5"
                : isDragging
                ? "border-primary bg-primary/10"
                : "cursor-pointer border-border bg-card hover:border-primary/45"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".epub,.txt,application/epub+zip,text/plain"
              className="sr-only"
              disabled={isUploading}
              onChange={(event) => void submitFile(event.target.files?.[0])}
            />
            <motion.div
              animate={
                isUploading && !reduceMotion
                  ? { y: [0, -4, 0], opacity: [0.72, 1, 0.72] }
                  : { y: 0, opacity: 1 }
              }
              transition={
                isUploading && !reduceMotion
                  ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" }
                  : undefined
              }
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary"
            >
              <Upload className="h-5 w-5" />
            </motion.div>
            <AnimatePresence mode="wait" initial={false}>
              {isUploading ? (
                <motion.div
                  key="uploading"
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
                >
                  <h2 className="text-xl font-semibold tracking-tight">
                    正在上传小说
                  </h2>
                  <p
                    className="mt-2 truncate text-sm font-medium text-foreground"
                    title={uploadFileName ?? undefined}
                  >
                    {uploadFileName}
                  </p>
                  <div className="mt-5">
                    <div className="flex items-center justify-between gap-4 text-xs">
                      <span className="text-muted-foreground" aria-live="polite">
                        {uploadPercent >= 100
                          ? "上传完成，正在创建处理任务"
                          : "文件正在安全传入私人书架"}
                      </span>
                      <span className="font-semibold tabular-nums text-foreground">
                        {uploadPercent}%
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label="小说上传进度"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={uploadPercent}
                      className="relative mt-2 h-2 overflow-hidden rounded-full bg-secondary"
                    >
                      <motion.div
                        className="absolute inset-0 origin-left rounded-full bg-primary"
                        initial={false}
                        animate={{ scaleX: uploadPercent / 100 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                      />
                      {uploadPercent < 100 && !reduceMotion && (
                        <motion.div
                          className="absolute inset-y-0 left-0 w-1/4 bg-primary-foreground/35"
                          animate={{ x: ["-100%", "400%"] }}
                          transition={{
                            duration: 1.25,
                            repeat: Infinity,
                            ease: "easeInOut",
                          }}
                        />
                      )}
                    </div>
                    <p className="mt-2 text-xs tabular-nums text-muted-foreground">
                      {formatBytes(uploadProgress?.loadedBytes ?? 0)} /{" "}
                      {formatBytes(uploadProgress?.totalBytes ?? 0)}
                    </p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="idle"
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
                >
                  <h2 className="text-xl font-semibold tracking-tight">
                    添加一本小说
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    点击选择或拖入文件。支持 EPUB、TXT，单个文件不超过
                    {` ${MAX_BOOK_UPLOAD_MEGABYTES} MB`}。
                  </p>
                  <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                    <FileText className="h-4 w-4" />
                    选择文件
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.label>
        </section>

        {(fileError || error) && (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive"
          >
            {fileError ?? error}
          </div>
        )}

        <section className="mt-14 sm:mt-18">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">书架</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {books.length > 0 ? `共 ${books.length} 本` : "从第一本书开始"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void fetchBooks()}
              className="tap-spring inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className="h-4 w-4" />
              刷新
            </button>
          </div>

          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {[0, 1].map((item) => (
                <div
                  key={item}
                  className="h-52 animate-pulse rounded-2xl border border-border bg-card"
                />
              ))}
            </div>
          ) : books.length === 0 ? (
            <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-border bg-card/45 px-6 text-center">
              <div>
                <BookOpen className="mx-auto h-8 w-8 text-primary" />
                <h3 className="mt-4 text-lg font-semibold">书架还是空的</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  上传一本 EPUB 或 TXT，处理完成后就能开始提问。
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {books.map((book) => {
                const isMutating = mutatingBookIds.includes(book.id);
                const isProcessing = PROCESSING_STATUSES.includes(book.status);
                return (
                  <article
                    key={book.id}
                    className="hover-lift grid min-h-52 grid-cols-[92px_1fr] gap-5 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[112px_1fr] sm:p-5"
                  >
                    <div className="flex min-h-36 flex-col justify-between rounded-xl bg-secondary p-3">
                      <BookOpen className="h-5 w-5 text-primary" />
                      <p className="line-clamp-4 text-sm font-bold leading-snug tracking-tight">
                        {book.title}
                      </p>
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-lg font-semibold tracking-tight">
                            {book.title}
                          </h3>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {book.originalFileName} ·{" "}
                            {formatBytes(book.fileSizeBytes)}
                          </p>
                        </div>
                        {book.visibility === "PRIVATE" && (
                          <button
                            type="button"
                            disabled={isMutating}
                            onClick={() => setPendingDelete(book)}
                            className="tap-spring rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                            aria-label={`删除《${book.title}》`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      <div className="mt-4 flex-1">
                        <div className="flex items-center justify-between text-xs">
                          <span
                            className={
                              book.status === "FAILED"
                                ? "font-medium text-destructive"
                                : "font-medium text-muted-foreground"
                            }
                          >
                            {STATUS_LABELS[book.status]}
                          </span>
                          <span className="text-muted-foreground">
                            {book.status === "READY"
                              ? `${book.sectionCount} 节 · ${readProgress(book)}`
                              : `${book.statusProgress}%`}
                          </span>
                        </div>
                        {isProcessing && (
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                            <motion.div
                              className="h-full origin-left rounded-full bg-primary"
                              initial={false}
                              animate={{ scaleX: book.statusProgress / 100 }}
                              transition={{ duration: 0.5, ease: "easeOut" }}
                            />
                          </div>
                        )}
                        {book.status === "FAILED" && (
                          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                            {book.failureMessage ??
                              "处理没有完成，可以重新尝试。"}
                          </p>
                        )}
                      </div>

                      <div className="mt-4">
                        {book.status === "READY" ? (
                          <button
                            type="button"
                            onClick={() => void openBook(book.id)}
                            className="tap-spring inline-flex w-full items-center justify-between rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
                          >
                            进入阅读助手
                            <ArrowRight className="h-4 w-4" />
                          </button>
                        ) : book.status === "FAILED" ? (
                          <button
                            type="button"
                            disabled={isMutating}
                            onClick={() => void retryBook(book.id)}
                            className="tap-spring inline-flex items-center gap-2 rounded-xl border border-border bg-secondary px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                          >
                            <RotateCcw className="h-4 w-4" />
                            重新处理
                          </button>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            可以离开此页面，处理会在后台继续。
                          </p>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        title="删除这本书？"
        description={
          pendingDelete
            ? `《${pendingDelete.title}》的原文件、对话、进度和书内记忆都会被删除。`
            : undefined
        }
        confirmLabel="删除书籍"
        tone="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return;
          void deleteBook(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </main>
  );
}
