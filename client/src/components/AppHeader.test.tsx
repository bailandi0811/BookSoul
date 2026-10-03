import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { AppHeader } from "./AppHeader";
import { useAppearanceStore } from "@/store/useAppearanceStore";

it("closes the background menu after selection and reopens with one click", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const previous = useAppearanceStore.getState();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<AppHeader account={false} />));
    const trigger = container.querySelector<HTMLElement>("summary")!;
    await act(async () => trigger.click());
    const option = [
      ...container.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
    ].find((input) => !input.checked)!;
    await act(async () => option.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
    await act(async () => trigger.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector("details")?.open).toBe(true);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    useAppearanceStore.getState().setTheme(previous.theme);
    useAppearanceStore.getState().setBackground(previous.background);
  }
});
