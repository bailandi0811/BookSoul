import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ getSectionWindow: vi.fn(), getReaderPosition: vi.fn(), saveReaderPosition: vi.fn(), getReferenceLocation: vi.fn() }));
vi.mock("@/lib/book-reader-api", async original => ({ ...await original<typeof import("@/lib/book-reader-api")>(), ...api }));
import { useReaderStore } from "./useReaderStore";
const hash = "a".repeat(64);
const sections = [{ id: "s", order: 1, title: "第一节", charCount: 80000 }];
const position = { bookId: "a", sectionId: "s", offset: 0, contentHash: hash, revision: 1, contentChanged: false, updatedAt: "2026-10-03T00:00:00Z" };
function windowAt(bookId: string, sectionId: string, offset: number) {
  const endOffset = Math.min(80000, offset + 16000);
  return { bookId, sectionId, sectionOrder: 1, sectionTitle: "第一节", contentHash: hash, totalLength: 80000, startOffset: offset, endOffset, nextOffset: endOffset < 80000 ? endOffset : null, text: "文".repeat(endOffset - offset) };
}
beforeEach(() => { vi.clearAllMocks(); useReaderStore.getState().clearPrivateState(); api.getReaderPosition.mockResolvedValue(null); api.getSectionWindow.mockImplementation(async (b, s, o) => windowAt(b, s, o)); api.saveReaderPosition.mockImplementation(async (b, input) => ({ ...position, bookId: b, ...input, revision: input.expectedRevision + 1 })); });
afterEach(() => { useReaderStore.getState().clearPrivateState(); vi.useRealTimers(); });
describe("bounded reader state", () => {
  it("preloads the next chapter while preserving the visible chapter and unsaved position", async () => {
    const two = [...sections, { id: "second", order: 2, title: "第二节", charCount: 80000 }];
    await useReaderStore.getState().openReader("a", two);
    await useReaderStore.getState().jumpToOffset(79000);
    await Promise.all([useReaderStore.getState().loadAdjacent("next"), useReaderStore.getState().loadAdjacent("next")]);
    expect(useReaderStore.getState().windows.map(w => w.sectionId)).toEqual(["s", "second"]);
    expect(useReaderStore.getState().sectionId).toBe("s");
    expect(useReaderStore.getState().anchorOffset).toBe(79000);
    expect(api.saveReaderPosition).not.toHaveBeenCalled();
    expect(api.getSectionWindow.mock.calls.filter(call => call[1] === "second")).toHaveLength(1);
  });
  it("saves the visible chapter using its own hash after crossing a chapter boundary", async () => {
    const two = [...sections, { id: "second", order: 2, title: "第二节", charCount: 80000 }];
    api.getSectionWindow.mockImplementation(async (b, s, o) => ({ ...windowAt(b, s, o), contentHash: (s === "s" ? "a" : "b").repeat(64) }));
    await useReaderStore.getState().openReader("a", two);
    await useReaderStore.getState().jumpToOffset(79000);
    await useReaderStore.getState().loadAdjacent("next");
    useReaderStore.getState().recordVisibleOffset(100, "second");
    await useReaderStore.getState().flushSave();
    expect(useReaderStore.getState().sectionId).toBe("second");
    expect(api.saveReaderPosition).toHaveBeenCalledWith("a", expect.objectContaining({ sectionId: "second", offset: 100, contentHash: "b".repeat(64) }), expect.any(AbortSignal));
  });
  it("loads the previous chapter tail and retries a failed next chapter without dropping text", async () => {
    const two = [...sections, { id: "second", order: 2, title: "第二节", charCount: 80000 }];
    api.getReaderPosition.mockResolvedValue({ ...position, sectionId: "second" });
    await useReaderStore.getState().openReader("a", two);
    await useReaderStore.getState().loadAdjacent("previous");
    expect(useReaderStore.getState().windows[0]).toMatchObject({ sectionId: "s", endOffset: 80000 });
    await useReaderStore.getState().goToSection("s");
    await useReaderStore.getState().jumpToOffset(79000);
    api.getSectionWindow.mockRejectedValueOnce(new Error("章末断网"));
    await useReaderStore.getState().loadAdjacent("next");
    expect(useReaderStore.getState().windows[0].sectionId).toBe("s");
    expect(useReaderStore.getState().error).toBe("章末断网");
    await useReaderStore.getState().retryWindow();
    expect(useReaderStore.getState().windows.at(-1)?.sectionId).toBe("second");
  });
  it("does not evict a still-visible short chapter during prefetch", async () => {
    const short = ["s", "second", "third", "fourth"].map((id, index) => ({ id, order: index + 1, title: id, charCount: 100 }));
    api.getSectionWindow.mockImplementation(async (b, s) => ({ ...windowAt(b, s, 0), sectionOrder: short.find(chapter => chapter.id === s)!.order, totalLength: 100, endOffset: 100, nextOffset: null, text: "文".repeat(100) }));
    await useReaderStore.getState().openReader("a", short);
    await useReaderStore.getState().loadAdjacent("next");
    await useReaderStore.getState().loadAdjacent("next");
    await useReaderStore.getState().loadAdjacent("next");
    expect(useReaderStore.getState().windows.map(w => w.sectionId)).toEqual(["s", "second", "third"]);
    useReaderStore.getState().recordVisibleOffset(20, "second");
    await useReaderStore.getState().loadAdjacent("next");
    expect(useReaderStore.getState().windows.map(w => w.sectionId)).toEqual(["second", "third", "fourth"]);
  });
  it("retains the visible window when the reader reverses while prefetch is in flight", async () => {
    await useReaderStore.getState().openReader("a", sections);
    await useReaderStore.getState().loadAdjacent("next");
    await useReaderStore.getState().loadAdjacent("next");
    useReaderStore.getState().recordVisibleOffset(20000);
    let finish!: (value: ReturnType<typeof windowAt>) => void;
    api.getSectionWindow.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const prefetch = useReaderStore.getState().loadAdjacent("next");
    useReaderStore.getState().recordVisibleOffset(1000);
    finish(windowAt("a", "s", 48000)); await prefetch;
    expect(useReaderStore.getState().windows.map(w => w.startOffset)).toEqual([0, 16000, 32000]);
    expect(useReaderStore.getState().error).toBeNull();
    useReaderStore.getState().recordVisibleOffset(20000);
    await useReaderStore.getState().loadAdjacent("next");
    expect(useReaderStore.getState().windows.map(w => w.startOffset)).toEqual([16000, 32000, 48000]);
  });
  it("loads one initial window, deduplicates and retains at most three", async () => {
    await useReaderStore.getState().openReader("a", sections);
    expect(api.getSectionWindow).toHaveBeenCalledTimes(1);
    await Promise.all([useReaderStore.getState().loadAdjacent("next"), useReaderStore.getState().loadAdjacent("next")]);
    expect(api.getSectionWindow).toHaveBeenCalledTimes(2);
    await useReaderStore.getState().loadAdjacent("next");
    useReaderStore.getState().recordVisibleOffset(20000);
    await useReaderStore.getState().loadAdjacent("next");
    expect(useReaderStore.getState().windows).toHaveLength(3);
    expect(useReaderStore.getState().windows[0].startOffset).toBe(16000);
  });
  it("drops responses after switching book or clearing identity", async () => {
    let finish!: (value: unknown) => void;
    api.getSectionWindow.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const old = useReaderStore.getState().openReader("a", sections);
    await vi.waitFor(() => expect(api.getSectionWindow).toHaveBeenCalled());
    await useReaderStore.getState().openReader("b", sections);
    finish(windowAt("a", "s", 0)); await old;
    expect(useReaderStore.getState().windows[0].bookId).toBe("b");
    useReaderStore.getState().clearPrivateState();
    expect(useReaderStore.getState().windows).toEqual([]);
  });
  it("debounces user positions, serializes saves, and does not save previews", async () => {
    vi.useFakeTimers(); await useReaderStore.getState().openReader("a", sections);
    useReaderStore.getState().recordVisibleOffset(50); useReaderStore.getState().recordVisibleOffset(100);
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.saveReaderPosition).toHaveBeenCalledTimes(1);
    expect(api.saveReaderPosition.mock.calls[0][1]).toMatchObject({ offset: 100, expectedRevision: 0 });
    await useReaderStore.getState().previewSection("s", 50000);
    useReaderStore.getState().recordVisibleOffset(51000); await vi.advanceTimersByTimeAsync(1000);
    expect(api.saveReaderPosition).toHaveBeenCalledTimes(1);
    await useReaderStore.getState().returnToReading();
    expect(useReaderStore.getState().anchorOffset).toBe(100);
  });
  it("preserves text on failure and pauses conflicting saves until explicit retry", async () => {
    vi.useFakeTimers(); await useReaderStore.getState().openReader("a", sections);
    api.getSectionWindow.mockRejectedValueOnce(new Error("离线"));
    await useReaderStore.getState().loadAdjacent("next");
    expect(useReaderStore.getState().windows).toHaveLength(1);
    api.saveReaderPosition.mockRejectedValueOnce(Object.assign(new Error("冲突"), { code: "READER_POSITION_CONFLICT" }));
    api.getReaderPosition.mockResolvedValue({ ...position, revision: 4 });
    useReaderStore.getState().recordVisibleOffset(80); await vi.advanceTimersByTimeAsync(1000);
    expect(useReaderStore.getState().saveStatus).toBe("conflict");
    useReaderStore.getState().recordVisibleOffset(90); await vi.advanceTimersByTimeAsync(2000);
    expect(api.saveReaderPosition).toHaveBeenCalledTimes(1);
    await useReaderStore.getState().retrySave();
    expect(api.saveReaderPosition.mock.calls[1][1]).toMatchObject({ offset: 90, expectedRevision: 4 });
  });
  it("restores changed text at section beginning with a visible explanation", async () => {
    api.getReaderPosition.mockResolvedValue({ ...position, offset: 50000, contentChanged: true });
    await useReaderStore.getState().openReader("a", sections);
    expect(useReaderStore.getState().anchorOffset).toBe(0);
    expect(useReaderStore.getState().notice).toContain("变更");
    expect(api.saveReaderPosition).not.toHaveBeenCalled();
  });
  it("saves the new chapter selected with the next-section control", async () => {
    const two = [...sections, { id: "second", order: 2, title: "第二节", charCount: 80000 }];
    await useReaderStore.getState().openReader("a", two);
    await useReaderStore.getState().goToSection("second");
    expect(useReaderStore.getState().preview).toBe(false);
    expect(api.saveReaderPosition).toHaveBeenCalledWith("a", expect.objectContaining({ sectionId: "second", offset: 0 }), expect.any(AbortSignal));
  });
  it("reloads changed content at chapter start instead of retrying the stale hash", async () => {
    await useReaderStore.getState().openReader("a", sections);
    api.saveReaderPosition.mockRejectedValueOnce(Object.assign(new Error("正文已变更"), { code: "READER_CONTENT_CHANGED" }));
    api.getSectionWindow.mockImplementation(async (b, s, o) => ({ ...windowAt(b, s, o), contentHash: "b".repeat(64) }));
    useReaderStore.getState().recordVisibleOffset(90); await useReaderStore.getState().flushSave();
    expect(useReaderStore.getState().windows[0].contentHash).toBe("b".repeat(64));
    expect(useReaderStore.getState().anchorOffset).toBe(0);
    expect(useReaderStore.getState().notice).toContain("变更");
    await useReaderStore.getState().retrySave();
    expect(api.saveReaderPosition.mock.calls[1][1]).toMatchObject({ offset: 0, contentHash: "b".repeat(64) });
  });
  it("jumps into an unloaded spacer and discards an earlier neighbor failure", async () => {
    await useReaderStore.getState().openReader("a", sections);
    api.getSectionWindow.mockRejectedValueOnce(new Error("上一段断网"));
    await useReaderStore.getState().loadAdjacent("next");
    await useReaderStore.getState().jumpToOffset(50000);
    expect(useReaderStore.getState().windows[0].startOffset).toBe(42000);
    await useReaderStore.getState().loadAdjacent("next");
    expect(useReaderStore.getState().windows).toHaveLength(2);
  });
});
