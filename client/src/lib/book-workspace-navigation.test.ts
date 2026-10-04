import { afterEach, describe, expect, it, vi } from "vitest";
const readerApi = vi.hoisted(() => ({ getReferenceLocation: vi.fn() }));
vi.mock("./book-reader-api", async original => ({ ...await original<typeof import("./book-reader-api")>(), ...readerApi }));
import { ensureBookChat, openReferenceInReader } from "./book-workspace-navigation";
import { useBooksStore } from "@/store/useBooksStore";
import { useChatStore } from "@/store/useChatStore";
import type { BookView } from "./books-api";
import { useReaderStore } from "@/store/useReaderStore";
afterEach(() => { vi.restoreAllMocks(); useBooksStore.getState().clearPrivateState(); });
describe("book chat preparation", () => {
  it("preserves the same-book session, messages and draft", async () => {
    useBooksStore.setState({ currentBook: { id: "a" } as BookView });
    useChatStore.setState({ currentBookId: "a", sessionId: "session", draftInput: "草稿", messages: [{ role: "user", content: "问题" }] });
    const prepare = vi.spyOn(useChatStore.getState(), "prepareBook");
    await ensureBookChat("a");
    expect(prepare).not.toHaveBeenCalled(); expect(useChatStore.getState().draftInput).toBe("草稿");
  });
  it("deduplicates first preparation and refuses a foreign active book", async () => {
    useBooksStore.setState({ currentBook: { id: "a" } as BookView });
    const prepare = vi.spyOn(useChatStore.getState(), "prepareBook").mockResolvedValue();
    await Promise.all([ensureBookChat("a"), ensureBookChat("a")]);
    expect(prepare).toHaveBeenCalledTimes(1);
    await ensureBookChat("b"); expect(prepare).toHaveBeenCalledTimes(1);
  });
  it("uses a trusted reference location and enters reader without fetching the saved chapter", async () => {
    useBooksStore.setState({ currentBook: { id: "a" } as BookView, sections: [{ id: "s", order: 1, title: "第一节", charCount: 80000 }] });
    readerApi.getReferenceLocation.mockResolvedValue({ bookId: "a", sectionId: "s", sectionOrder: 1, contentHash: "a".repeat(64), startOffset: 2000, endOffset: 2010, precision: "excerpt" });
    const normal = vi.spyOn(useReaderStore.getState(), "openReader").mockResolvedValue();
    const prime = vi.spyOn(useReaderStore.getState(), "primePreview").mockResolvedValue();
    const preview = vi.spyOn(useReaderStore.getState(), "previewLocation").mockResolvedValue();
    const switchView = vi.spyOn(useBooksStore.getState(), "switchBookView").mockResolvedValue();
    await openReferenceInReader({ bookId: "a", sectionId: "s", sectionOrder: 1, sectionTitle: "第一节", chunkId: "chunk", chunkIndex: 0, excerpt: "测试", score: 1 });
    expect(readerApi.getReferenceLocation).toHaveBeenCalledWith("a", "chunk");
    expect(normal).not.toHaveBeenCalled();
    expect(prime).toHaveBeenCalled(); expect(switchView).toHaveBeenCalledWith("reader"); expect(preview).toHaveBeenCalledWith(expect.objectContaining({ startOffset: 2000 }));
  });
});
