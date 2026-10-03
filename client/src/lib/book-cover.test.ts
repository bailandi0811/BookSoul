import { expect, it } from "vitest";
import { bookCoverVariant } from "./book-cover";

it("spreads the four bindings across books and keeps them through display sorting and new uploads", () => {
  const books = Array.from({ length: 4 }, (_, index) => ({
    id: `book-${index * 4}`,
    createdAt: `2026-10-0${index + 1}T00:00:00Z`,
  }));
  const variants = books.map((book) => bookCoverVariant(book.id, books));
  expect(new Set(variants).size).toBe(4);
  const updated = [
    { id: "new-book", createdAt: "2026-10-05T00:00:00Z" },
    ...[...books].reverse(),
  ];
  expect(books.map((book) => bookCoverVariant(book.id, updated))).toEqual(
    variants,
  );
});
