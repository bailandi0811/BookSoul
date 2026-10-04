import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import ReaderAssistantPanel from "./ReaderAssistantPanel";
import { useBooksStore } from "@/store/useBooksStore";
import { useChatStore } from "@/store/useChatStore";
import type { BookView } from "@/lib/books-api";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it("reuses same-book chat messages and draft, and cancels on close", async () => {
  useBooksStore.setState({ currentBook: { id: "a" } as BookView });
  useChatStore.setState({ currentBookId: "a", draftInput: "保留的草稿", sessionId: "session", messages: [{ role: "user", content: "已有问题" }] });
  const stop = vi.spyOn(useChatStore.getState(), "stopGenerating");
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => root.render(<ReaderAssistantPanel bookId="a" onClose={() => {}} />));
    expect(document.body.textContent).toContain("已有问题");
    expect(document.body.querySelector("textarea")?.value).toBe("保留的草稿");
    await act(async () => root.unmount());
    expect(stop).toHaveBeenCalled(); expect(useChatStore.getState().draftInput).toBe("保留的草稿");
  } finally { container.remove(); vi.restoreAllMocks(); useBooksStore.getState().clearPrivateState(); }
});
