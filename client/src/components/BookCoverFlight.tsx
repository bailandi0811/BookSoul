import { useLayoutEffect } from "react";
import { watchCoverFlight } from "@/lib/book-cover-flight";
import { peekBooksViewIntent, useBooksStore } from "@/store/useBooksStore";

export function BookCoverFlightHost() {
  const view = useBooksStore((state) => state.view);
  const bookId = useBooksStore((state) => state.currentBook?.id ?? null);
  useLayoutEffect(() => {
    const landingView = peekBooksViewIntent() ?? view;
    return watchCoverFlight(landingView, bookId);
  }, [view, bookId]);
  return null;
}
