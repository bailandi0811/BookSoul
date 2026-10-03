import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Select } from "./Select";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const onChange = vi.fn();
const options = Array.from({ length: 24 }, (_, index) => ({
  value: String(index + 1),
  label: `第 ${index + 1} 节  章节 ${index + 1}`,
}));
beforeEach(async () => {
  onChange.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <Select
        label="当前章节"
        value="8"
        options={options}
        onChange={onChange}
      />,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
it("lets arrows move through chapters and commits only on Enter", async () => {
  const trigger =
    container.querySelector<HTMLButtonElement>('[role="combobox"]')!;
  trigger.focus();
  await act(async () => trigger.click());
  expect(document.querySelector('[role="listbox"]')).not.toBeNull();
  expect(
    document.querySelector('[role="option"][aria-selected="true"]')
      ?.textContent,
  ).toContain("第 8 节");
  await act(async () =>
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(onChange).not.toHaveBeenCalled();
  await act(async () =>
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(onChange).toHaveBeenCalledWith("9");
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(trigger);
});
it("closes on Escape without changing the chapter or closing a surrounding dialog", async () => {
  const trigger =
    container.querySelector<HTMLButtonElement>('[role="combobox"]')!;
  const parentEscape = vi.fn();
  window.addEventListener("keydown", parentEscape);
  try {
    trigger.focus();
    await act(async () => trigger.click());
    await act(async () =>
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "End",
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    await act(async () =>
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(onChange).not.toHaveBeenCalled();
    expect(
      parentEscape.mock.calls.some(([event]) => event.key === "Escape"),
    ).toBe(false);
  } finally {
    window.removeEventListener("keydown", parentEscape);
  }
});
it("selects from a pointer and supports cancellation outside the list", async () => {
  const trigger =
    container.querySelector<HTMLButtonElement>('[role="combobox"]')!;
  await act(async () => trigger.click());
  await act(async () =>
    [
      ...document.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    ][14].click(),
  );
  expect(onChange).toHaveBeenCalledWith("15");
  await act(async () => trigger.click());
  await act(async () =>
    document.body.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true }),
    ),
  );
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(onChange).toHaveBeenCalledTimes(1);
});
