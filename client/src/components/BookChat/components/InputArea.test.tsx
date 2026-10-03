import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/store/useAuthStore";
import { useChatStore } from "@/store/useChatStore";
import { InputArea } from "./InputArea";

describe("chat composer interactions", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    useAuthStore.getState().signIn({
      accessToken: "fixture-access",
      user: {
        id: "fixture-reader",
        name: "Reader",
        email: "reader@example.invalid",
      },
    });
    useChatStore.getState().resetBookChat();
    useChatStore.setState({
      currentBookId: "fixture-book",
      sessionId: "fixture-session",
      draftInput: "灯塔有什么含义？",
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
      String(url) === "/api/chat"
        ? new Response(
            'data: {"content":"基于已读原文的回答。"}\n\ndata: [DONE]\n\n',
            { headers: { "Content-Type": "text/event-stream" } },
          )
        : new Response(JSON.stringify({ success: true, data: [] })),
    );
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useChatStore.getState().resetBookChat();
    vi.restoreAllMocks();
  });

  it("keeps Chinese composition in the draft instead of sending on Enter", async () => {
    await act(async () => root.render(<InputArea />));
    await act(async () => {
      container.querySelector("textarea")!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          isComposing: true,
          bubbles: true,
        }),
      );
    });
    expect(useChatStore.getState().draftInput).toBe("灯塔有什么含义？");
    expect(useChatStore.getState().messages).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps search permissions explicit and resets them after one submitted message", async () => {
    await act(async () => root.render(<InputArea />));
    const optionsButton = () =>
      [...container.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("本次选项"),
      )!;
    expect(optionsButton()).toBeDefined();
    await act(async () => optionsButton().click());
    const checkboxes = [
      ...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ];
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes.map((input) => input.checked)).toEqual([false, false]);
    await act(async () => checkboxes.forEach((input) => input.click()));
    await act(async () =>
      [...document.querySelectorAll<HTMLButtonElement>(".paper-dialog button")]
        .find((button) => button.textContent === "应用到本次提问")!
        .click(),
    );
    await act(async () =>
      container
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    const request = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => url === "/api/chat")!;
    expect(JSON.parse(String(request[1]?.body))).toEqual({
      message: "灯塔有什么含义？",
      sessionId: "fixture-session",
      spoilerOverride: true,
      externalResearch: true,
    });
    expect(useChatStore.getState().messages.at(-1)?.content).toBe(
      "基于已读原文的回答。",
    );
    await act(async () => optionsButton().click());
    expect(
      [
        ...document.querySelectorAll<HTMLInputElement>(
          'input[type="checkbox"]',
        ),
      ].map((input) => input.checked),
    ).toEqual([false, false]);
  });

  it("returns focus to the options button when Escape closes its panel", async () => {
    await act(async () => root.render(<InputArea />));
    const button = [...container.querySelectorAll("button")].find((element) =>
      element.textContent?.includes("本次选项"),
    )!;
    expect(button).toBeDefined();
    button.focus();
    await act(async () => button.click());
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.focus();
    await act(async () =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
  });
  it("discards unconfirmed permissions when the options dialog is cancelled", async () => {
    await act(async () => root.render(<InputArea />));
    const trigger = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("本次选项"),
    )!;
    await act(async () => trigger.click());
    await act(async () =>
      document
        .querySelector<HTMLInputElement>(
          '.paper-dialog input[type="checkbox"]',
        )!
        .click(),
    );
    await act(async () =>
      [...document.querySelectorAll<HTMLButtonElement>(".paper-dialog button")]
        .find((button) => button.textContent === "取消")!
        .click(),
    );
    await act(async () =>
      container
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    const request = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => url === "/api/chat")!;
    expect(JSON.parse(String(request[1]?.body)).spoilerOverride).toBe(false);
  });
});
