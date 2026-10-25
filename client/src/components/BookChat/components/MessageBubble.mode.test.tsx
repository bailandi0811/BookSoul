import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect } from "vitest";
import { MessageBubble } from "./MessageBubble";
describe("deep evidence notice", () => {
  it("does not label failed retrieval as completed", () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      act(() =>
        root.render(
          <MessageBubble
            message={{
              id: "a1",
              role: "assistant",
              content: "超时",
              thinkingSteps: ["检索中"],
              responseStatus: "failed",
            }}
          />,
        ),
      );
      expect(container.textContent).toContain("本次处理失败");
      expect(container.textContent).not.toContain("检索中");
      expect(container.textContent).not.toContain("已完成检索");
    } finally {
      act(() => root.unmount());
    }
  });
  it("keeps retrieval progress compact without exposing step text", () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      act(() =>
        root.render(
          <MessageBubble
            message={{
              id: "a2",
              role: "assistant",
              content: "",
              isStreaming: true,
              isThinking: true,
              thinkingSteps: ["正在查询第 4 章", "准备比较三个召回片段"],
            }}
          />,
        ),
      );
      expect(container.textContent).toContain("正在查找已读原文");
      expect(container.textContent).not.toContain("正在查询第 4 章");
      expect(container.textContent).not.toContain("准备比较三个召回片段");
      expect(container.querySelector('[aria-expanded]')).toBeNull();
    } finally {
      act(() => root.unmount());
    }
  });
  it("displays limited evidence without replacing answer content", () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      act(() =>
        root.render(
          <MessageBubble
            message={{
              id: "a3",
              role: "assistant",
              content: "可见原文不足。",
              runSummary: {
                mode: "deep",
                stopReason: "no_queries",
                retrievalRounds: 1,
                incomplete: true,
              },
            }}
          />,
        ),
      );
      expect(container.textContent).toContain("依据有限");
      expect(container.textContent).toContain("可见原文不足。");
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });
});
