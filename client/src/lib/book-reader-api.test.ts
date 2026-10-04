import { afterEach, describe, expect, it, vi } from "vitest";
import { getSectionWindow, getReaderPosition, saveReaderPosition, ReaderApiError } from "./book-reader-api";

const windowData = { bookId: "book", sectionId: "section", sectionOrder: 1, sectionTitle: "第一节", contentHash: "a".repeat(64), totalLength: 4, startOffset: 0, endOffset: 4, text: "合成正文", nextOffset: null };
const respond = (data: unknown) => new Response(JSON.stringify({ success: true, data }));
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe("reader API contracts", () => {
  it("uses bounded content endpoint, authenticated fetch, and no-store", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(respond(windowData));
    expect(await getSectionWindow("book", "section", 0)).toEqual(windowData);
    expect(fetch).toHaveBeenCalledWith("/api/books/book/sections/section/content?offset=0&limit=16000", expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }));
  });
  it("refuses corrupt offsets and foreign response scopes", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(respond({ ...windowData, endOffset: 3 }));
    await expect(getSectionWindow("book", "section", 0)).rejects.toThrow("阅读服务响应无效");
    fetch.mockResolvedValue(respond({ ...windowData, bookId: "other" }));
    await expect(getSectionWindow("book", "section", 0)).rejects.toThrow("阅读服务响应无效");
  });
  it("reads absent position and preserves stable conflict codes", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(respond(null));
    expect(await getReaderPosition("book")).toBeNull();
    fetch.mockResolvedValue(new Response(JSON.stringify({ code: "READER_POSITION_CONFLICT", message: "其他窗口已更新位置" }), { status: 409 }));
    await expect(saveReaderPosition("book", { sectionId: "section", offset: 0, contentHash: "a".repeat(64), expectedRevision: 1 })).rejects.toMatchObject({ status: 409, code: "READER_POSITION_CONFLICT" });
    expect(ReaderApiError.prototype).toBeInstanceOf(Error);
  });
  it("propagates cancellation and bounds even a hanging response", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise<Response>(() => {}));
    const controller = new AbortController(), pending = getSectionWindow("book", "section", 0, controller.signal);
    const rejected = expect(pending).rejects.toBeInstanceOf(DOMException);
    controller.abort(); await rejected;
    const timed = getReaderPosition("book");
    const timeout = expect(timed).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(15001); await timeout;
  });
});
