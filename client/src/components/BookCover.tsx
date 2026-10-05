import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { bookCoverVariant, type CoverVariant } from "@/lib/book-cover";
import type { CoverSlot } from "@/lib/book-cover-flight";
import { useBooksStore } from "@/store/useBooksStore";

const COVER_COLORS = ["#45514c", "#71606d", "#454b51", "#b6b09c"];

export function BookCover({
  bookId,
  title,
  bookmarked = false,
  compact = false,
  shared = false,
  className,
  variant,
  slot,
}: {
  bookId: string;
  title: string;
  bookmarked?: boolean;
  compact?: boolean;
  shared?: boolean;
  className?: string;
  variant?: CoverVariant;
  slot?: CoverSlot;
}) {
  const libraryVariant = useBooksStore((state) =>
    bookCoverVariant(bookId, state.books, state.coverBindings),
  );
  const colorIndex = variant ?? libraryVariant;
  return (
    <motion.div
      layoutId={shared ? `book-cover-${bookId}` : undefined}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={cn("book-cover", compact && "book-cover-compact", className)}
      data-book-cover={bookId}
      data-cover-slot={slot}
      data-cover-tone={colorIndex}
      style={{ backgroundColor: COVER_COLORS[colorIndex] }}
      aria-hidden="true"
    >
      <span className="book-cover-pages" />
      <span className="book-cover-spine" />
      <svg
        className="book-cover-emblem"
        viewBox="0 0 100 85"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.05"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {colorIndex === 0 ? (
          <>
            <path d="M8 71c12-7 21-7 33-1s21 6 33-1 16-5 20-3M3 80c15-6 24-6 38 0s22 5 35-1 13-4 19-2M36 66l5-39h18l5 39M38 27h24l-4-8H42l-4 8Zm2-8h20M41 39h18m-16 0 1-12m11 12-1-12m-7 16h7v15h-7V43Z" />
            <path d="m19 25 10 2m-6-13 9 7m43 5-10 1m7-13-8 7M70 5a9 9 0 1 0 13 13A8 8 0 0 1 70 5Z" />
          </>
        ) : colorIndex === 1 ? (
          <>
            <path d="M53 4a15 15 0 1 0 19 21A14 14 0 0 1 53 4ZM50 49c-12-8-24-8-37-3v26c12-4 25-2 37 5 12-7 25-9 37-5V46c-13-5-25-5-37 3Zm0 0v28M21 53c9-2 17 0 23 4m-23 3c9-2 17 0 23 4m35-11c-9-2-17 0-23 4m23 3c-9-2-17 0-23 4" />
            <path d="m79 6 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Zm-57 6v7m-3-4h6" />
          </>
        ) : colorIndex === 2 ? (
          <>
            <circle cx="50" cy="39" r="27" />
            <circle cx="50" cy="39" r="23" />
            <path d="M50 16v4m0 38v4M27 39h4m38 0h4M50 22v18l10 7m-21 22-5 8m27-8 5 8M40 8l-5-4m25 4 5-4M11 21l3 3m73-3-3 3M17 60l-4 2m70-2 4 2" />
            <path d="m11 4 2 4 4 2-4 2-2 4-2-4-4-2 4-2 2-4Zm76 60 2 4 4 2-4 2-2 4-2-4-4-2 4-2 2-4Z" />
          </>
        ) : (
          <>
            <path d="M50 75V37m0 24C28 62 16 47 18 34c18 0 29 12 32 27Zm0-7c22 1 33-13 31-26-18 1-28 12-31 26ZM50 38C28 32 27 16 34 11c11 3 16 16 16 27Zm0 0c21-6 22-22 15-27-11 3-16 16-15 27Z" />
            <path d="M49 26c-7-6-10-19 1-22 11 3 8 16 1 22M13 76c20-6 53-6 74 0m-8-70 2 4 4 2-4 2-2 4-2-4-4-2 4-2 2-4Z" />
          </>
        )}
      </svg>
      {!compact && (
        <span className="book-cover-title font-reading">{title}</span>
      )}
      {!compact && <span className="book-cover-imprint">BookSoul Library</span>}
      {bookmarked && <span className="book-cover-bookmark" />}
    </motion.div>
  );
}
