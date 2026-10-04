import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ReaderBody } from "./components/ReaderBody";
import { useReaderStore } from "@/store/useReaderStore";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it("shows consecutive chapter headings and highlights only the referenced chapter", async () => {
  const first = { bookId: "a", sectionId: "s", sectionOrder: 1, sectionTitle: "灯塔下的重逢", contentHash: "a".repeat(64), totalLength: 2, startOffset: 0, endOffset: 2, text: "前文", nextOffset: null };
  const second = { ...first, sectionId: "second", sectionOrder: 2, sectionTitle: "旧信与潮声", contentHash: "b".repeat(64), text: "后文" };
  useReaderStore.setState({ bookId: "a", sectionId: "s", windows: [first, second], highlight: { bookId: "a", sectionId: "s", sectionOrder: 1, contentHash: first.contentHash, startOffset: 0, endOffset: 1, precision: "excerpt" }, error: null });
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => root.render(<ReaderBody />));
    expect([...container.querySelectorAll("h2")].map(h => h.textContent)).toEqual(["灯塔下的重逢", "旧信与潮声"]);
    expect([...container.querySelectorAll("mark")].map(mark => mark.textContent)).toEqual(["前"]);
  } finally { await act(async () => root.unmount()); container.remove(); useReaderStore.getState().clearPrivateState(); }
});
it("renders untrusted book markup as text and preserves content while retrying", async () => {
  useReaderStore.setState({ bookId: "a", sectionId: "s", windows: [{ bookId: "a", sectionId: "s", sectionOrder: 1, sectionTitle: "测试", contentHash: "a".repeat(64), totalLength: 32, startOffset: 0, endOffset: 32, text: '<script>alert("fixture")</script>', nextOffset: null }], error: "网络离线" });
  const retry = vi.spyOn(useReaderStore.getState(), "retryWindow").mockResolvedValue();
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => root.render(<ReaderBody />));
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain('<script>alert("fixture")</script>');
    expect(container.textContent).toContain("网络离线");
    await act(async () => [...container.querySelectorAll("button")].find(b => b.textContent?.includes("重试"))!.click());
    expect(retry).toHaveBeenCalledOnce();
  } finally { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); useReaderStore.getState().clearPrivateState(); }
});
