import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useAuthStore } from "@/store/useAuthStore";
import { MessageBubble } from "./MessageBubble";

describe("MessageBubble email action", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    useAuthStore.getState().clearAuthentication();
    useAuthStore.getState().signIn({
      accessToken: "access-token",
      user: {
        id: "reader-1",
        email: "reader@example.com",
        name: "读者",
      },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.style.overflow = "";
  });

  it("从已完成的助手回复打开预填账号邮箱的可编辑草稿", () => {
    act(() => {
      root.render(
        <MessageBubble
          message={{ role: "assistant", content: "这是阅读笔记。" }}
        />,
      );
    });

    const emailButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="发送到邮箱"]',
    );
    expect(emailButton).not.toBeNull();

    act(() => emailButton?.click());

    const dialog = document.body.querySelector('[role="dialog"]');
    const recipient = dialog?.querySelector<HTMLInputElement>(
      'input[type="email"]',
    );
    const body = dialog?.querySelector<HTMLTextAreaElement>("textarea");
    expect(recipient?.value).toBe("reader@example.com");
    expect(body?.value).toContain("这是阅读笔记。");
    expect(dialog?.textContent).toContain("确认并发送");
  });

  it("不允许从正在流式生成的回复发送", () => {
    act(() => {
      root.render(
        <MessageBubble
          message={{
            role: "assistant",
            content: "尚未完成",
            isStreaming: true,
          }}
        />,
      );
    });

    expect(
      container.querySelector('button[aria-label="发送到邮箱"]'),
    ).toBeNull();
  });

  it("只展示安全的联网来源链接", () => {
    act(() => {
      root.render(
        <MessageBubble
          message={{
            role: "assistant",
            content: "现实背景说明。",
            externalReferences: [
              {
                title: "可信来源",
                url: "https://example.com/source",
                snippet: "来源摘要",
              },
              {
                title: "恶意来源",
                url: "javascript:alert(1)",
                snippet: "不应显示",
              },
            ],
          }}
        />,
      );
    });

    const sourcesButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("联网来源 1 条"),
    );
    expect(sourcesButton).toBeDefined();
    act(() => sourcesButton?.click());

    const links =
      container.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]');
    expect(links).toHaveLength(1);
    expect(links[0]?.href).toBe("https://example.com/source");
    expect(links[0]?.rel).toContain("noreferrer");
    expect(container.textContent).not.toContain("恶意来源");
  });
});
