export type CoverVariant = 0 | 1 | 2 | 3;

export function bookCoverVariant(
  bookId: string,
  books: ReadonlyArray<{ id: string; createdAt: string }>,
  bindings: Readonly<Record<string, CoverVariant>> = {},
): CoverVariant {
  if (Object.prototype.hasOwnProperty.call(bindings, bookId))
    return bindings[bookId];
  // Upload order spreads the four bindings evenly; display sorting cannot
  // change a book's cover when it is opened in the conversation workspace.
  const ordered = [...books].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
  const index = ordered.findIndex((book) => book.id === bookId);
  const identity =
    index < 0
      ? Array.from(bookId).reduce(
          (hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0,
          0,
        )
      : index;
  return (identity % 4) as CoverVariant;
}

export function assignBookCoverBindings(
  books: ReadonlyArray<{ id: string; createdAt: string }>,
  previous: Readonly<Record<string, CoverVariant>>,
): Record<string, CoverVariant> {
  const ids = new Set(books.map((book) => book.id));
  const bindings: Record<string, CoverVariant> = Object.fromEntries(
    Object.entries(previous).filter(([id]) => ids.has(id)),
  );
  const counts = [0, 0, 0, 0];
  for (const binding of Object.values(bindings)) counts[binding]++;
  const unassigned = books.filter(
    (book) => !Object.prototype.hasOwnProperty.call(bindings, book.id),
  );
  unassigned.sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
  for (const book of unassigned) {
    const variant = counts.indexOf(Math.min(...counts)) as CoverVariant;
    bindings[book.id] = variant;
    counts[variant]++;
  }
  return bindings;
}
