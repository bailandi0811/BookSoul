import { AppHeader } from "@/components/AppHeader";
import { BookCover } from "@/components/BookCover";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  MAX_BOOK_UPLOAD_MEGABYTES,
  validateBookUpload,
} from "@/lib/book-upload-policy";
import type { BookStatus, BookView } from "@/lib/books-api";
import { useBooksStore } from "@/store/useBooksStore";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { beginCoverFlightFrom } from "@/lib/book-cover-flight";
import { preloadLibraryDestinations, preloadOverview, preloadReader } from "@/lib/book-page-loaders";

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
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function readProgress(book: BookView): string {
  if (!book.readingProgress || book.readingProgress.mode === "NOT_STARTED")
    return "尚未开始";
  if (book.readingProgress.mode === "FINISHED") return "已读完整本书";
  return `读到第 ${book.readingProgress.currentSectionOrder ?? 1} 节`;
}

function readingPercent(book: BookView): number {
  if (book.readingProgress?.mode === "FINISHED") return 100;
  if (book.readingProgress?.mode !== "IN_PROGRESS" || !book.sectionCount)
    return 0;
  return Math.min(
    100,
    Math.round(
      ((book.readingProgress.currentSectionOrder ?? 1) / book.sectionCount) *
        100,
    ),
  );
}

export function Entrance({ onBackHome }: { onBackHome: () => void }) {
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
  useEffect(() => {
    void fetchBooks();
    preloadLibraryDestinations();
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
  const featuredBook =
    books.find(
      (book) =>
        book.status === "READY" && book.readingProgress?.mode === "IN_PROGRESS",
    ) ??
    books.find((book) => book.status === "READY") ??
    books[0] ??
    null;
  const uploadPercent = uploadProgress?.percent ?? 0;
  const readingCount = books.filter(
    (book) =>
      book.status === "READY" && book.readingProgress?.mode === "IN_PROGRESS",
  ).length;
  const processingCount = books.filter((book) =>
    PROCESSING_STATUSES.includes(book.status),
  ).length;

  return (
    <main className="library-room min-h-full text-foreground">
      <AppHeader />

      <div className="library-main">
        <button
          type="button"
          className="library-back-home tap-spring"
          onClick={onBackHome}
        >
          <ArrowLeft size={16} strokeWidth={1.7} />
          返回首页
        </button>
        <div className="library-intro">
          <div>
            <h1 className="font-display text-3xl leading-snug sm:text-4xl">
              AI 藏书室
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              把书放下，故事继续。
            </p>
          </div>
          <div className="library-summary">
            <span>
              <span className="library-summary-dot" />
              {readingCount} 本在读
            </span>
            {processingCount > 0 && <span>{processingCount} 本整理中</span>}
          </div>
        </div>
        <aside className="library-sidebar" aria-label="阅读工作台">
          {featuredBook && (
            <section className="library-feature" aria-label="继续阅读">
              <button type="button" className="library-book-stage" disabled={featuredBook.status !== "READY"} aria-label={`打开《${featuredBook.title}》本书空间`} onPointerEnter={preloadOverview} onFocus={preloadOverview} onClick={() => { beginCoverFlightFrom(featuredBook.id, "feature"); void openBook(featuredBook.id, "book"); }}>
                <BookCover
                  bookId={featuredBook.id}
                  title={featuredBook.title}
                  slot="feature"
                  bookmarked={
                    featuredBook.readingProgress?.mode === "IN_PROGRESS"
                  }
                />
              </button>
              <div className="library-feature-copy">
                <p className="library-feature-heading">
                  {featuredBook.status === "READY" ? "继续阅读" : "正在整理"}
                  <BookOpen size={15} strokeWidth={1.4} />
                </p>
                <h2 className="font-reading line-clamp-2">
                  <button type="button" disabled={featuredBook.status !== "READY"} onPointerEnter={preloadOverview} onFocus={preloadOverview} onClick={() => { beginCoverFlightFrom(featuredBook.id, "feature"); void openBook(featuredBook.id, "book"); }}>{featuredBook.title}</button>
                </h2>
                <p className="library-feature-meta">
                  <span>
                    {featuredBook.status === "READY"
                      ? readProgress(featuredBook)
                      : `当前阶段 ${featuredBook.statusProgress}%`}
                  </span>
                  <span>
                    {featuredBook.status === "READY"
                      ? `共 ${featuredBook.sectionCount} 节`
                      : "处理会在后台继续"}
                  </span>
                </p>
                {featuredBook.status === "READY" && (
                  <div className="library-reading-mark">
                    <div className="library-reading-label">
                      <span>阅读书签</span>
                      <span>{readingPercent(featuredBook)}%</span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label={`${featuredBook.title}阅读进度`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={readingPercent(featuredBook)}
                      className="library-reading-track"
                    >
                      <span
                        style={{ width: `${readingPercent(featuredBook)}%` }}
                      />
                    </div>
                  </div>
                )}
                <div className="library-feature-footer">
                  <p className="library-feature-limit">
                    <ShieldCheck size={13} />
                    {featuredBook.status === "READY"
                      ? featuredBook.readingProgress?.mode === "FINISHED"
                        ? "可检索完整本书"
                        : `只谈第 1—${featuredBook.readingProgress?.currentSectionOrder ?? 1} 节`
                      : "后台处理会自动继续"}
                  </p>
                  <div className="feature-action">
                    {featuredBook.status === "READY" && (
                      <><button
                        type="button"
                        onPointerEnter={preloadReader}
                        onFocus={preloadReader}
                        onClick={() => { beginCoverFlightFrom(featuredBook.id, "feature"); void openBook(featuredBook.id, "reader"); }}
                        className="tap-spring inline-flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 text-xs font-medium text-foreground hover:bg-secondary"
                      >
                        <BookOpen size={16} strokeWidth={1.5} /> 继续阅读
                      </button><button
                        type="button"
                        onClick={() => { beginCoverFlightFrom(featuredBook.id, "feature"); void openBook(featuredBook.id); }}
                        className="tap-spring inline-flex items-center justify-between gap-3 rounded-xl bg-primary px-4 text-xs font-medium text-primary-foreground"
                      >
                        继续对话 <ArrowRight size={16} />
                      </button></>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          <section className="reading-overview" aria-label="阅读概览">
            <h2 className="font-display">你的阅读书房</h2>
            <div className="reading-overview-counts">
              <p>
                <strong>{books.length}</strong>
                <span>本藏书</span>
              </p>
              <p>
                <strong>{readingCount}</strong>
                <span>本正在读</span>
              </p>
              <p>
                <strong>
                  {
                    books.filter(
                      (book) => book.readingProgress?.mode === "FINISHED",
                    ).length
                  }
                </strong>
                <span>本已读完</span>
              </p>
            </div>
            <p className="reading-overview-note">
              <ShieldCheck size={13} />
              阅读进度决定助手可见的内容
            </p>
          </section>

          <div
            className={`library-upload ${isDragging ? "library-upload-dragging" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              if (!isUploading) setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              if (!isUploading) void submitFile(event.dataTransfer.files[0]);
            }}
          >
            <div className="library-upload-heading">
              <Upload size={18} strokeWidth={1.4} />
              <div>
                <h2>添加新书</h2>
                <p>导入小说，保存书签与对话</p>
              </div>
            </div>
            <label
              className="library-upload-label tap-spring"
              aria-busy={isUploading}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".epub,.txt,application/epub+zip,text/plain"
                className="sr-only"
                disabled={isUploading}
                onChange={(event) => void submitFile(event.target.files?.[0])}
              />
              <Upload size={16} />{" "}
              <span className="library-upload-button-text">
                {isUploading ? "正在上传" : "添加小说"}
              </span>
            </label>
            {isUploading ? (
              <div className="library-upload-progress">
                <p className="truncate text-xs text-muted-foreground">
                  {uploadFileName}
                </p>
                <div
                  role="progressbar"
                  aria-label="小说上传进度"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={uploadPercent}
                  className="mt-2 h-1 overflow-hidden rounded-full bg-secondary"
                >
                  <motion.div
                    initial={false}
                    animate={{ scaleX: uploadPercent / 100 }}
                    className="h-full origin-left bg-primary"
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatBytes(uploadProgress?.loadedBytes ?? 0)} /{" "}
                  {formatBytes(uploadProgress?.totalBytes ?? 0)}{" "}
                  <span className="float-right tabular-nums">
                    {uploadPercent}%
                  </span>
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                <span className="library-upload-copy">
                  拖入一本小说，或选择文件。{" "}
                </span>
                EPUB / TXT · 最大 {MAX_BOOK_UPLOAD_MEGABYTES} MB
              </p>
            )}
          </div>
          {(fileError || error) && (
            <div
              role="alert"
              className="library-error rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {fileError ?? error}
            </div>
          )}
        </aside>
        <section className="library-shelf" aria-label="我的书架">
          <div className="library-shelf-heading flex items-center justify-between gap-4">
            <div className="flex items-baseline gap-3">
              <h2 className="font-display text-2xl">我的书架</h2>
              <span className="library-shelf-count">{books.length} 本</span>
            </div>
            <button
              type="button"
              onClick={() => void fetchBooks()}
              className="tap-spring inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <RefreshCw size={14} /> 刷新
            </button>
          </div>
          {isLoading ? (
            <div className="bookshelf-grid" aria-label="正在加载书架">
              {[0, 1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="aspect-[2/3] animate-pulse rounded-md bg-secondary"
                />
              ))}
            </div>
          ) : books.length === 0 ? (
            <div className="library-empty">
              <BookOpen
                className="mx-auto h-8 w-8 text-primary"
                strokeWidth={1.3}
              />
              <h3 className="font-display mt-4 text-2xl">把第一段故事放进来</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                添加一本 EPUB 或 TXT，获得属于这本书的阅读助手。
              </p>
            </div>
          ) : (
            <div className="bookshelf-grid">
              {books.map((book) => {
                const isMutating = mutatingBookIds.includes(book.id);
                const isProcessing = PROCESSING_STATUSES.includes(book.status);
                return (
                  <article key={book.id} className="bookshelf-item">
                    <button
                      type="button"
                      className="bookshelf-open"
                      disabled={book.status !== "READY"}
                      onPointerEnter={preloadOverview}
                      onFocus={preloadOverview}
                      onClick={() => { beginCoverFlightFrom(book.id, "shelf"); void openBook(book.id, "book"); }}
                      aria-label={`打开《${book.title}》本书空间`}
                    >
                      <span className="bookshelf-display">
                        <BookCover
                          bookId={book.id}
                          title={book.title}
                          bookmarked={
                            book.readingProgress?.mode === "IN_PROGRESS"
                          }
                          slot="shelf"
                        />
                      </span>
                      <span className="bookshelf-title font-reading">
                        {book.title}
                      </span>
                    </button>
                    {book.visibility === "PRIVATE" && (
                      <button
                        type="button"
                        disabled={isMutating}
                        onClick={() => setPendingDelete(book)}
                        className="bookshelf-delete"
                        aria-label={`删除《${book.title}》`}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                    <p className="bookshelf-meta truncate">
                      {book.author ?? book.originalFileName}
                      {book.status === "READY" && ` · ${book.sectionCount} 节`}
                    </p>
                    <div className="bookshelf-status">
                      <span
                        className={
                          book.status === "FAILED" ? "text-destructive" : ""
                        }
                      >
                        {book.status === "READY"
                          ? readProgress(book)
                          : STATUS_LABELS[book.status]}
                      </span>
                      {book.visibility === "SYSTEM" && (
                        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          系统书籍
                        </span>
                      )}
                      {isProcessing && (
                        <span
                          role="progressbar"
                          aria-label={`${book.title}处理进度`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={book.statusProgress}
                          className="bookshelf-stage-percent"
                        >
                          {book.statusProgress}%
                        </span>
                      )}
                    </div>
                    {book.status === "FAILED" && (
                      <div className="mt-3">
                        <p className="line-clamp-2 text-xs leading-relaxed text-destructive">
                          {book.failureMessage ??
                            "处理没有完成，可以重新尝试。"}
                        </p>
                        <button
                          type="button"
                          disabled={isMutating}
                          onClick={() => void retryBook(book.id)}
                          className="mt-2 inline-flex min-h-11 items-center gap-2 text-xs font-medium text-primary"
                        >
                          <RotateCcw size={14} />
                          重新处理
                        </button>
                      </div>
                    )}
                    {book.status === "DELETING" && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        正在清理书籍及相关数据
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
        <p className="library-footnote flex items-center gap-2 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck size={14} className="shrink-0" />{" "}
          按阅读进度检索与引用，每段对话都属于当前这本书。
        </p>
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
