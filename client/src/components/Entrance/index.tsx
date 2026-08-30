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
  ShieldCheck,
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

const BOOK_COVER_TONES = [
  "from-[#355747] to-[#243d33] text-[#f7ead4]",
  "from-[#a95f4d] to-[#744035] text-[#fff0dc]",
  "from-[#5f6f73] to-[#394b51] text-[#f5ead9]",
  "from-[#c5b18e] to-[#9a8262] text-[#332a22]",
  "from-[#b98b52] to-[#80572f] text-[#fff0d7]",
  "from-[#796b75] to-[#4d4249] text-[#f6eadc]",
] as const;

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 KB";
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function readProgress(book: BookView): string {
  if (!book.readingProgress || book.readingProgress.mode === "NOT_STARTED") {
    return "尚未开始";
  }
  if (book.readingProgress.mode === "FINISHED") return "已读完整本书";
  return `读到第 ${book.readingProgress.currentSectionOrder ?? 1} 节`;
}

function coverTone(index: number): string {
  return BOOK_COVER_TONES[index % BOOK_COVER_TONES.length];
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
  const featuredBook =
    books.find(
      (book) =>
        book.status === "READY" &&
        book.readingProgress?.mode === "IN_PROGRESS",
    ) ??
    books.find((book) => book.status === "READY") ??
    books[0] ??
    null;
  const featuredBookIndex = featuredBook
    ? Math.max(
        0,
        books.findIndex((book) => book.id === featuredBook.id),
      )
    : 0;

  return (
    <main className="paper-atmosphere min-h-[100dvh] text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/75 bg-background/95">
        <div className="mx-auto flex min-h-17 max-w-[86rem] items-center justify-between gap-4 px-4 py-2 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-[14px] bg-primary text-primary-foreground shadow-[0_10px_24px_-14px_rgb(var(--primary)/0.8)]">
              <Library className="h-[18px] w-[18px]" />
            </span>
            <div>
              <div className="text-base font-bold tracking-tight">BookSoul</div>
              <div className="text-[11px] text-muted-foreground">
                私人阅读助手
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:block [&>div>div:first-child]:py-2">
              <AccountSection />
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[86rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <h1 className="mb-5 text-2xl font-bold tracking-tight sm:text-3xl">
          {featuredBook?.status === "READY"
            ? "继续读下去吧"
            : books.length > 0
              ? "书籍正在进入你的私人书架"
              : "把第一本小说放进书架"}
        </h1>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(22rem,0.85fr)]">
          <article className="warm-card-raised relative min-h-[17.5rem] overflow-hidden rounded-[24px] p-5 sm:p-6">
            {featuredBook ? (
              <div className="grid h-full gap-5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-7">
                <div
                  className={`relative flex min-h-40 overflow-hidden rounded-[18px] bg-gradient-to-br p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.18)] sm:min-h-full ${coverTone(featuredBookIndex)}`}
                >
                  <BookOpen className="absolute right-3 top-3 h-5 w-5 opacity-65" />
                  <p className="font-reading mt-auto line-clamp-4 text-2xl font-semibold leading-snug">
                    {featuredBook.title}
                  </p>
                </div>

                <div className="flex min-w-0 flex-col justify-center py-1">
                  <p className="text-xs font-semibold text-primary">
                    {featuredBook.status === "READY"
                      ? "继续阅读"
                      : STATUS_LABELS[featuredBook.status]}
                  </p>
                  <h2 className="font-reading mt-2 line-clamp-2 text-3xl font-semibold leading-tight sm:text-4xl">
                    {featuredBook.title}
                  </h2>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {featuredBook.status === "READY"
                      ? readProgress(featuredBook)
                      : `当前阶段 ${featuredBook.statusProgress}%`}
                  </p>

                  {featuredBook.status === "READY" ? (
                    <div className="mt-7 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => void openBook(featuredBook.id)}
                        className="tap-spring inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[0_12px_28px_-18px_rgb(var(--primary)/0.9)]"
                      >
                        继续对话
                        <ArrowRight className="h-4 w-4" />
                      </button>
                      <span className="warm-inset inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm text-muted-foreground">
                        <FileText className="h-4 w-4" />
                        {featuredBook.sectionCount} 节
                      </span>
                    </div>
                  ) : (
                    <p className="warm-inset mt-6 rounded-xl px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                      处理会在后台继续，完成后即可进入阅读助手。
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col justify-between">
                <span className="warm-tint grid h-14 w-14 place-items-center rounded-[18px] text-primary">
                  <BookOpen className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-primary">
                    你的私人书架
                  </p>
                  <h2 className="mt-2 max-w-2xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
                    一个懂阅读进度，也会附上原文依据的助手
                  </h2>
                  <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
                    上传 EPUB 或 TXT。每本书的进度、对话和记忆都会独立保存。
                  </p>
                </div>
              </div>
            )}
          </article>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <motion.label
              whileTap={isUploading ? undefined : { scale: 0.995 }}
              aria-busy={isUploading}
              aria-disabled={isUploading}
              onDragEnter={(event) => {
                event.preventDefault();
                if (!isUploading) setIsDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                if (!isUploading) {
                  void submitFile(event.dataTransfer.files[0]);
                }
              }}
              className={`warm-card flex min-h-[8.25rem] cursor-pointer flex-col justify-between rounded-[24px] p-5 transition-colors sm:p-6 ${
                isUploading
                  ? "cursor-wait border-primary/50 bg-primary/5"
                  : isDragging
                    ? "border-primary bg-primary/10"
                    : "hover:border-primary/45"
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
              <div className="flex items-start justify-between gap-4">
                <motion.span
                  animate={
                    isUploading && !reduceMotion
                      ? { y: [0, -3, 0], opacity: [0.75, 1, 0.75] }
                      : { y: 0, opacity: 1 }
                  }
                  transition={
                    isUploading && !reduceMotion
                      ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" }
                      : undefined
                  }
                  className="warm-tint grid h-11 w-11 shrink-0 place-items-center rounded-[14px] text-primary"
                >
                  <Upload className="h-5 w-5" />
                </motion.span>
                {!isUploading && (
                  <span className="rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground">
                    选择文件
                  </span>
                )}
              </div>

              <AnimatePresence mode="wait" initial={false}>
                {isUploading ? (
                  <motion.div
                    key="uploading"
                    initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                  >
                    <h2 className="mt-4 text-lg font-semibold">正在上传小说</h2>
                    <p
                      className="mt-1 truncate text-xs text-muted-foreground"
                      title={uploadFileName ?? undefined}
                    >
                      {uploadFileName}
                    </p>
                    <div
                      role="progressbar"
                      aria-label="小说上传进度"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={uploadPercent}
                      className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary"
                    >
                      <motion.div
                        className="h-full origin-left rounded-full bg-primary"
                        initial={false}
                        animate={{ scaleX: uploadPercent / 100 }}
                      />
                    </div>
                    <div className="mt-2 flex justify-between gap-3 text-[11px] text-muted-foreground">
                      <span>
                        {formatBytes(uploadProgress?.loadedBytes ?? 0)} /{" "}
                        {formatBytes(uploadProgress?.totalBytes ?? 0)}
                      </span>
                      <span className="font-semibold tabular-nums text-foreground">
                        {uploadPercent}%
                      </span>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="idle"
                    initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                  >
                    <h2 className="mt-4 text-lg font-semibold">添加一本小说</h2>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      支持 EPUB、TXT，单个文件不超过 {MAX_BOOK_UPLOAD_MEGABYTES} MB
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.label>

            <article className="warm-card flex min-h-[8.25rem] flex-col justify-between rounded-[24px] p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <span className="warm-tint grid h-11 w-11 place-items-center rounded-[14px] text-primary">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <span className="rounded-full bg-primary/10 px-3 py-1.5 text-[11px] font-semibold text-primary">
                  默认开启
                </span>
              </div>
              <div className="mt-4">
                <h2 className="text-lg font-semibold">尊重你的阅读位置</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  默认只检索并引用当前已读范围内的内容。
                </p>
              </div>
            </article>
          </div>
        </section>

        {(fileError || error) && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {fileError ?? error}
          </div>
        )}

        <section className="mt-8 sm:mt-10">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">我的书架</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {books.length > 0 ? `${books.length} 本小说` : "从第一本书开始"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void fetchBooks()}
              className="tap-spring warm-card inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className="h-4 w-4" />
              刷新
            </button>
          </div>

          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((item) => (
                <div
                  key={item}
                  className="warm-card h-55 animate-pulse rounded-[18px]"
                />
              ))}
            </div>
          ) : books.length === 0 ? (
            <div className="warm-card grid min-h-52 place-items-center rounded-[24px] px-6 text-center">
              <div>
                <BookOpen className="mx-auto h-8 w-8 text-primary" />
                <h3 className="mt-4 text-lg font-semibold">书架还是空的</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  使用上方的添加卡片上传第一本 EPUB 或 TXT。
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {books.map((book, index) => {
                const isMutating = mutatingBookIds.includes(book.id);
                const isProcessing = PROCESSING_STATUSES.includes(book.status);
                return (
                  <article
                    key={book.id}
                    className="warm-card hover-lift group grid min-h-55 grid-cols-[6rem_minmax(0,1fr)] gap-4 rounded-[18px] p-4"
                  >
                    <div
                      className={`relative flex min-h-42 overflow-hidden rounded-[14px] bg-gradient-to-br p-3 ${coverTone(index)}`}
                    >
                      <BookOpen className="absolute right-2.5 top-2.5 h-4 w-4 opacity-60" />
                      <p className="font-reading mt-auto line-clamp-4 text-lg font-semibold leading-snug">
                        {book.title}
                      </p>
                    </div>

                    <div className="flex min-w-0 flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-reading truncate text-lg font-semibold">
                            {book.title}
                          </h3>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {book.author ?? book.originalFileName}
                          </p>
                        </div>
                        {book.visibility === "PRIVATE" && (
                          <button
                            type="button"
                            disabled={isMutating}
                            onClick={() => setPendingDelete(book)}
                            className="tap-spring rounded-lg p-2 text-muted-foreground opacity-70 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 disabled:opacity-40"
                            aria-label={`删除《${book.title}》`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                        <span
                          className={`rounded-full px-2.5 py-1 font-semibold ${
                            book.status === "FAILED"
                              ? "bg-destructive/10 text-destructive"
                              : book.status === "READY"
                                ? "bg-primary/10 text-primary"
                                : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {STATUS_LABELS[book.status]}
                        </span>
                        <span className="text-muted-foreground">
                          {book.status === "READY"
                            ? `${book.sectionCount} 节`
                            : `${book.statusProgress}%`}
                        </span>
                      </div>

                      <div className="mt-3 flex-1">
                        {book.status === "READY" && (
                          <p className="text-xs font-medium text-foreground/80">
                            {readProgress(book)}
                          </p>
                        )}
                        {isProcessing && (
                          <div
                            role="progressbar"
                            aria-label={`${book.title}处理进度`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={book.statusProgress}
                            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary"
                          >
                            <motion.div
                              className="h-full origin-left rounded-full bg-primary"
                              initial={false}
                              animate={{ scaleX: book.statusProgress / 100 }}
                              transition={{ duration: 0.5, ease: "easeOut" }}
                            />
                          </div>
                        )}
                        {book.status === "FAILED" && (
                          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                            {book.failureMessage ?? "处理没有完成，可以重新尝试。"}
                          </p>
                        )}
                      </div>

                      <div className="mt-3">
                        {book.status === "READY" ? (
                          <button
                            type="button"
                            onClick={() => void openBook(book.id)}
                            className="tap-spring inline-flex w-full items-center justify-between rounded-xl border border-primary/35 bg-primary/5 px-3 py-2.5 text-xs font-semibold text-primary hover:bg-primary hover:text-primary-foreground"
                          >
                            进入阅读助手
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        ) : book.status === "FAILED" ? (
                          <button
                            type="button"
                            disabled={isMutating}
                            onClick={() => void retryBook(book.id)}
                            className="tap-spring inline-flex items-center gap-2 rounded-xl border border-border bg-secondary px-3 py-2.5 text-xs font-semibold disabled:opacity-50"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            重新处理
                          </button>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">
                            可以离开，处理会在后台继续
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
