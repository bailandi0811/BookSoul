import { beginCoverFlightFrom, type CoverSlot } from "@/lib/book-cover-flight";
import { loadBooksViewModule } from "@/lib/book-page-loaders";
import type { BooksView } from "@/store/useBooksStore";
import { useBooksStore } from "@/store/useBooksStore";

export function preloadBooksViewTarget(target: Exclude<BooksView, "library">) {
  void loadBooksViewModule(target).catch(() => {});
}

/** Fly immediately, then open the book while the route chunk and metadata load in parallel. */
export function openBookFromShelf(
  bookId: string,
  slot: CoverSlot,
  target: Exclude<BooksView, "library"> = "workspace",
) {
  beginCoverFlightFrom(bookId, slot);
  void useBooksStore.getState().openBook(bookId, target);
}
