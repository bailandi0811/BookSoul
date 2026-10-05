import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import BookOverview from ".";
import { useBooksStore } from "@/store/useBooksStore";
import { useReaderStore } from "@/store/useReaderStore";
import type { BookView } from "@/lib/books-api";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it("offers separate reading and chat entrances and only loads position metadata", async () => {
  useBooksStore.setState({ currentBook: { id: "a", title: "合成小说", sectionCount: 4, visibility: "PRIVATE" } as BookView, view: "book", isWorkspaceLoading: false });
  const position = vi.spyOn(useReaderStore.getState(), "loadPosition").mockResolvedValue();
  const navigate = vi.spyOn(useBooksStore.getState(), "switchBookView").mockResolvedValue();
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => root.render(<BookOverview />));
    expect(container.textContent).toContain("本书空间"); expect(container.textContent).toContain("合成小说");
    expect(position).toHaveBeenCalledWith("a");
    const buttons = [...container.querySelectorAll("button")];
    await act(async () => buttons.find(b => b.textContent?.includes("开始阅读"))!.click());
    expect(navigate).toHaveBeenCalledWith("reader");
    await act(async () => buttons.find(b => b.textContent?.includes("进入聊天"))!.click());
    expect(navigate).toHaveBeenCalledWith("workspace");
  }   finally { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); useBooksStore.getState().clearPrivateState(); }
});
it("shows the furthest confirmed chapter when resume sits earlier", async () => {
  useBooksStore.setState({
    currentBook: { id: "a", title: "合成小说", sectionCount: 20, visibility: "PRIVATE" } as BookView,
    sections: [{ id: "s3", order: 3, title: "第三章", charCount: 10 }],
    readingProgress: { mode: "IN_PROGRESS", currentSectionOrder: 18, spoilerCeiling: 18, updatedAt: "2026-10-04T00:00:00.000Z" },
    view: "book",
    isWorkspaceLoading: false,
  });
  useReaderStore.setState({ position: { bookId: "a", sectionId: "s3", offset: 0, contentHash: "a".repeat(64), revision: 2, updatedAt: "2026-10-04T00:00:00.000Z", contentChanged: false } });
  vi.spyOn(useReaderStore.getState(), "loadPosition").mockResolvedValue();
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => root.render(<BookOverview />));
    expect(container.textContent).toContain("已读到第 18 节，下次从第 3 节继续");
    expect(container.textContent).toContain("助手可讨论到第 18 节，按整章计算");
    expect(container.textContent).not.toContain("分别保存");
  } finally { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); useBooksStore.getState().clearPrivateState(); }
});
