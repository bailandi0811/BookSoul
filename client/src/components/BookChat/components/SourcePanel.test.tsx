import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message, Reference } from "@/store/useChatStore";
import { SourcePanel } from "./SourcePanel";

vi.mock("@/lib/book-workspace-navigation", () => ({
  openReferenceInReader: vi.fn(),
}));

const reference: Reference = {
  bookId: "book-1",
  sectionId: "section-4",
  sectionOrder: 4,
  sectionTitle: "离开 B612",
  chunkId: "chunk-4",
  chunkIndex: 0,
  excerpt: "我每天都要清理火山。",
  score: 0.9,
};

describe("SourcePanel", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("shows the empty state before a question is asked", () => {
    act(() =>
      root.render(
        <SourcePanel messageKey="empty" onClose={() => undefined} />,
      ),
    );
    expect(container.textContent).toContain("提问后，这里会显示原文依据");
    expect(container.textContent).toContain("引用会随当前回答更新");
  });

  it("shows only the references attached to the selected answer", () => {
    const message: Message = {
      id: "a1",
      role: "assistant",
      content: "回答",
      references: [reference],
    };
    act(() =>
      root.render(
        <SourcePanel
          message={message}
          messageKey="answer-1"
          onClose={() => undefined}
        />,
      ),
    );
    expect(container.textContent).toContain("本次回答引用 1 处");
    expect(container.textContent).toContain("第 4 节");
    expect(container.textContent).toContain("离开 B612");
    expect(container.textContent).toContain("我每天都要清理火山。");
    expect(container.textContent).not.toContain("chunk-4");
    expect(container.textContent).not.toContain("0.9");
  });

  it("uses a neutral loading state without rendering retrieval steps", () => {
    act(() =>
      root.render(
        <SourcePanel
          message={{
            id: "a2",
            role: "assistant",
            content: "",
            isStreaming: true,
            thinkingSteps: ["内部检索步骤"],
          }}
          messageKey="loading"
          onClose={() => undefined}
        />,
      ),
    );
    expect(
      container.querySelector('[aria-label="正在整理原文依据"]'),
    ).not.toBeNull();
    expect(container.textContent).not.toContain("内部检索步骤");
  });

  it("reveals multiple references one at a time", async () => {
    vi.useFakeTimers();
    const references = [
      reference,
      {
        ...reference,
        sectionId: "section-5",
        sectionOrder: 5,
        sectionTitle: "玫瑰",
        chunkId: "chunk-5",
        excerpt: "第二处原文。",
      },
      {
        ...reference,
        sectionId: "section-6",
        sectionOrder: 6,
        sectionTitle: "启程",
        chunkId: "chunk-6",
        excerpt: "第三处原文。",
      },
    ];
    act(() =>
      root.render(
        <SourcePanel
          message={{
            id: "a3",
            role: "assistant",
            content: "回答",
            references,
          }}
          messageKey="answer-stream"
          onClose={() => undefined}
        />,
      ),
    );
    expect(container.textContent).toContain(reference.excerpt);
    expect(container.textContent).not.toContain("第二处原文。");

    await act(async () => vi.advanceTimersByTimeAsync(180));
    expect(container.textContent).toContain("第二处原文。");
    expect(container.textContent).not.toContain("第三处原文。");

    await act(async () => vi.advanceTimersByTimeAsync(180));
    expect(container.textContent).toContain("第三处原文。");
  });
});
