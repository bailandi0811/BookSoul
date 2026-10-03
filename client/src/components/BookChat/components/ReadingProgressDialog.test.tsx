import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useBooksStore } from "@/store/useBooksStore";
import { ReadingProgressDialog } from "./ReadingProgressDialog";

const previous = useBooksStore.getState();
const container = document.createElement("div");
document.body.append(container);
const root = createRoot(container);
afterEach(() => {
  act(() => root.render(null));
  useBooksStore.setState(previous);
});

it("keeps a selected chapter pending until the bookmark is explicitly saved", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const save = vi.fn(async () => {});
  const close = vi.fn();
  useBooksStore.setState({
    readingProgress: {
      mode: "IN_PROGRESS",
      currentSectionOrder: 8,
      spoilerCeiling: 8,
      updatedAt: "2026-10-03",
    },
    sections: [8, 9].map((order) => ({
      id: `section-${order}`,
      order,
      title: `章节 ${order}`,
      charCount: 100,
    })),
    workspaceError: null,
    updateProgress: save,
  });
  await act(async () =>
    root.render(<ReadingProgressDialog open onClose={close} />),
  );
  const chapter = document.querySelector<HTMLButtonElement>(
    '[role="combobox"][aria-label="当前读到"]',
  )!;
  await act(async () => chapter.click());
  await act(async () =>
    [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')]
      .find((option) => option.textContent?.includes("第 9 节"))!
      .click(),
  );
  expect(save).not.toHaveBeenCalled();
  await act(async () =>
    document
      .querySelector(".paper-dialog form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(save).toHaveBeenCalledExactlyOnceWith("IN_PROGRESS", 9);
  expect(close).toHaveBeenCalledOnce();
});

it("leaves a failed save visible instead of reporting success or closing the dialog", async () => {
  const close = vi.fn();
  useBooksStore.setState({
    readingProgress: {
      mode: "FINISHED",
      currentSectionOrder: null,
      spoilerCeiling: 24,
      updatedAt: "2026-10-03",
    },
    workspaceError: null,
    updateProgress: async () => {
      useBooksStore.setState({ workspaceError: "书签保存失败" });
    },
  });
  await act(async () =>
    root.render(<ReadingProgressDialog open onClose={close} />),
  );
  await act(async () =>
    document
      .querySelector(".paper-dialog form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(close).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(
    "书签保存失败",
  );
});
