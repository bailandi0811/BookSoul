import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { useBooksStore } from "@/store/useBooksStore";
import { AssistantSettings } from "./AssistantSettings";

it("keeps save feedback visible and returns focus to the settings trigger after the server updates its timestamp", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const previous = useBooksStore.getState();
  const assistant = {
    id: "fixture-assistant",
    bookId: "fixture-book",
    name: "阅读助手",
    responseDepth: "BALANCED" as const,
    tone: "NATURAL" as const,
    customInstruction: null,
    createdAt: "2026-10-03T00:00:00Z",
    updatedAt: "2026-10-03T00:00:00Z",
  };
  useBooksStore.setState({
    assistant,
    workspaceError: null,
    updateAssistant: async () => {
      useBooksStore.setState({
        assistant: { ...assistant, updatedAt: "2026-10-03T01:00:00Z" },
      });
      return true;
    },
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<AssistantSettings />));
    const trigger = container.querySelector("button")!;
    trigger.focus();
    await act(async () => trigger.click());
    await act(async () =>
      document
        .querySelector(".paper-dialog form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "已保存",
    );
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>('.paper-dialog [aria-label="关闭"]')!
        .click(),
    );
    expect(document.activeElement).toBe(trigger);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    useBooksStore.setState(previous);
  }
});

it("locks the editable draft during a pending save", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const previous = useBooksStore.getState();
  let finish!: (saved: boolean) => void;
  useBooksStore.setState({
    assistant: {
      id: "pending-assistant",
      bookId: "fixture-book",
      name: "阅读助手",
      responseDepth: "BALANCED",
      tone: "NATURAL",
      customInstruction: null,
      createdAt: "2026-10-03",
      updatedAt: "2026-10-03",
    },
    workspaceError: null,
    updateAssistant: () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<AssistantSettings />));
    await act(async () => container.querySelector("button")!.click());
    await act(async () =>
      document
        .querySelector(".paper-dialog form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    expect(
      document.querySelector<HTMLInputElement>(
        '[role="dialog"] input:not([type="radio"])',
      )!.disabled,
    ).toBe(true);
    expect(
      document.querySelector<HTMLTextAreaElement>('[role="dialog"] textarea')!
        .disabled,
    ).toBe(true);
    await act(async () => finish(true));
    expect(
      document.querySelector<HTMLInputElement>(
        '[role="dialog"] input:not([type="radio"])',
      )!.disabled,
    ).toBe(false);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    useBooksStore.setState(previous);
  }
});

it("loads the latest saved values when opening either settings entry and discards cancelled edits", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const previous = useBooksStore.getState();
  const assistant = {
    id: "shared-assistant",
    bookId: "fixture-book",
    name: "阅读助手",
    responseDepth: "BALANCED" as const,
    tone: "NATURAL" as const,
    customInstruction: null,
    createdAt: "2026-10-03",
    updatedAt: "2026-10-03",
  };
  useBooksStore.setState({
    assistant,
    workspaceError: null,
    updateAssistant: async (input) => {
      useBooksStore.setState({ assistant: { ...assistant, ...input } });
      return true;
    },
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <>
          <AssistantSettings />
          <AssistantSettings compact />
        </>,
      ),
    );
    const triggers = [
      ...container.querySelectorAll<HTMLButtonElement>(
        '[aria-label="助手设置"]',
      ),
    ];
    await act(async () => triggers[0].click());
    await act(async () =>
      document.querySelector<HTMLInputElement>('input[value="DEEP"]')!.click(),
    );
    await act(async () =>
      document
        .querySelector(".paper-dialog form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>('.paper-dialog [aria-label="关闭"]')!
        .click(),
    );
    await act(async () => triggers[1].click());
    expect(
      document.querySelector<HTMLInputElement>(
        '[role="dialog"] input[value="DEEP"]',
      )!.checked,
    ).toBe(true);
    await act(async () =>
      document
        .querySelector<HTMLInputElement>(
          '[role="dialog"] input[value="BRIEF"]',
        )!
        .click(),
    );
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>(
          '[role="dialog"] [aria-label="关闭"]',
        )!
        .click(),
    );
    await act(async () => triggers[1].click());
    expect(
      document.querySelector<HTMLInputElement>(
        '[role="dialog"] input[value="DEEP"]',
      )!.checked,
    ).toBe(true);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    useBooksStore.setState(previous);
  }
});
