import { useLayoutEffect } from "react";
import { watchCoverFlight } from "@/lib/book-cover-flight";
import { useBooksStore } from "@/store/useBooksStore";

export function BookCoverFlightHost() {
  const view = useBooksStore((state) => state.view);
  const bookId = useBooksStore((state) => state.currentBook?.id ?? null);
  useLayoutEffect(() => watchCoverFlight(view, bookId), [view, bookId]);
  return null;
}
