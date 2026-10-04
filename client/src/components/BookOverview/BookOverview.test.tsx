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
  } finally { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); useBooksStore.getState().clearPrivateState(); }
});
