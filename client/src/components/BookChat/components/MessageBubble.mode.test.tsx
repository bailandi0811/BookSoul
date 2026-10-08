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
              role: "assistant",
              content: "超时",
              thinkingSteps: ["检索中"],
              responseStatus: "failed",
            }}
          />,
        ),
      );
      expect(container.textContent).toContain("本次处理失败");
      expect(container.textContent).not.toContain("已完成检索");
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
