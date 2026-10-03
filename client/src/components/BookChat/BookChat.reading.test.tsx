import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBooksStore } from "@/store/useBooksStore";
import { useChatStore } from "@/store/useChatStore";
import BookChat from "./index";

describe("reading a streaming conversation", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const userMessage = {
    role: "user" as const,
    content: "灯塔有什么含义？",
    createdAt: 1,
  };
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    useBooksStore.setState({
      currentBook: {
        id: "fixture-book",
        title: "雾港来信",
        author: null,
        visibility: "PRIVATE",
        status: "READY",
        statusProgress: 100,
        failureCode: null,
        failureMessage: null,
        originalFileName: "fixture.txt",
        mimeType: "text/plain",
        fileSizeBytes: 100,
        sectionCount: 8,
        chunkCount: 10,
        readyAt: null,
        createdAt: "2026-10-03",
        updatedAt: "2026-10-03",
        assistant: null,
        readingProgress: null,
      },
      assistant: null,
      sections: [],
      readingProgress: null,
      isWorkspaceLoading: false,
      workspaceError: null,
    });
    useChatStore.setState({
      messages: [
        userMessage,
        { role: "assistant", content: "正在回答", isStreaming: true },
      ],
      isLoading: true,
      sessionId: "fixture-session",
      sessions: [],
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useChatStore.getState().resetBookChat();
    useBooksStore.getState().clearPrivateState();
    vi.restoreAllMocks();
  });
  it("preserves the reader's scroll position when tokens arrive above the latest reply", async () => {
    await act(async () => root.render(<BookChat />));
    const viewport = container.querySelector<HTMLElement>('[role="log"]');
    expect(viewport).not.toBeNull();
    Object.defineProperties(viewport!, {
      scrollHeight: { configurable: true, value: 1500 },
      clientHeight: { configurable: true, value: 500 },
    });
    viewport!.scrollTop = 200;
    await act(async () =>
      viewport!.dispatchEvent(new Event("scroll", { bubbles: true })),
    );
    await act(async () =>
      useChatStore.setState({
        messages: [
          userMessage,
          {
            role: "assistant",
            content: "正在回答，新内容已到达",
            isStreaming: true,
          },
        ],
      }),
    );
    expect(viewport!.scrollTop).toBe(200);
    const latest = container.querySelector<HTMLButtonElement>(
      '[aria-label="回到最新回复"]',
    );
    expect(latest).not.toBeNull();
    await act(async () => latest!.click());
    expect(viewport!.scrollTop).toBe(1500);
  });
  it("continues following tokens when the reader stays near the bottom", async () => {
    await act(async () => root.render(<BookChat />));
    const viewport = container.querySelector<HTMLElement>('[role="log"]');
    expect(viewport).not.toBeNull();
    Object.defineProperties(viewport!, {
      scrollHeight: { configurable: true, value: 1500 },
      clientHeight: { configurable: true, value: 500 },
    });
    viewport!.scrollTop = 980;
    await act(async () =>
      viewport!.dispatchEvent(new Event("scroll", { bubbles: true })),
    );
    await act(async () =>
      useChatStore.setState({
        messages: [
          userMessage,
          { role: "assistant", content: "新内容", isStreaming: true },
        ],
      }),
    );
    expect(viewport!.scrollTop).toBe(1500);
  });
  it("cycles mobile drawer focus in both directions without entering hidden controls", async () => {
    const matchMedia = window.matchMedia.bind(window);
    vi.spyOn(window, "matchMedia").mockImplementation((query) =>
      Object.defineProperty(matchMedia(query), "matches", { value: false }),
    );
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(
      function (this: HTMLElement) {
        const hidden =
          this.matches('[role="separator"]') ||
          (this.closest("details:not([open])") !== null &&
            this.tagName !== "SUMMARY");
        return (hidden
          ? []
          : [new DOMRect(0, 0, 44, 44)]) as unknown as DOMRectList;
      },
    );
    await act(async () => root.render(<BookChat />));
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="打开侧栏"]')!
        .click(),
    );
    const panel = container.querySelector<HTMLElement>('[role="dialog"]')!;
    const first = panel.querySelector<HTMLButtonElement>("button")!;
    const last = panel.querySelector<HTMLButtonElement>(
      '[aria-label="切换到深色主题"]',
    )!;
    expect(first).toBe(document.activeElement);
    expect(last).not.toBeNull();
    await act(async () =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey: true,
          cancelable: true,
        }),
      ),
    );
    expect(document.activeElement).toBe(last);
    await act(async () =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", cancelable: true }),
      ),
    );
    expect(document.activeElement).toBe(first);
  });
});
