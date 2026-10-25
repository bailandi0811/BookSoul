import { beforeEach, describe, expect, it, vi } from "vitest";

const flightMocks = vi.hoisted(() => ({
  beginCoverFlightFrom: vi.fn(),
}));

const loaderMocks = vi.hoisted(() => ({
  loadBooksViewModule: vi.fn(() => Promise.resolve()),
}));

const storeMocks = vi.hoisted(() => ({
  openBook: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/book-cover-flight", () => ({
  beginCoverFlightFrom: flightMocks.beginCoverFlightFrom,
}));

vi.mock("@/lib/book-page-loaders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/book-page-loaders")>()),
  loadBooksViewModule: loaderMocks.loadBooksViewModule,
}));

vi.mock("@/store/useBooksStore", () => ({
  useBooksStore: {
    getState: () => ({ openBook: storeMocks.openBook }),
  },
}));

import { openBookFromShelf, preloadBooksViewTarget } from "./book-shelf-navigation";

describe("book-shelf-navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loaderMocks.loadBooksViewModule.mockImplementation(() => Promise.resolve());
  });

  it("preloads the target route chunk", () => {
    preloadBooksViewTarget("reader");
    expect(loaderMocks.loadBooksViewModule).toHaveBeenCalledWith("reader");
  });

  it("starts cover flight before openBook", () => {
    openBookFromShelf("book-a", "shelf", "book");
    expect(flightMocks.beginCoverFlightFrom).toHaveBeenCalledWith("book-a", "shelf");
    expect(storeMocks.openBook).toHaveBeenCalledWith("book-a", "book");
  });
});
