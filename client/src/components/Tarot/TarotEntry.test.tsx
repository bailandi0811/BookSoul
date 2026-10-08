import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { TarotEntry } from "./TarotEntry";
import { useAuthStore } from "@/store/useAuthStore";

afterEach(() => {
  useAuthStore.setState({ isAuthenticated: false });
});

it("paints the tarot entry before the tarot page stylesheet loads", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  useAuthStore.setState({ isAuthenticated: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<TarotEntry />));
    const link = container.querySelector("a");
    expect(link?.textContent).toContain("心绪塔罗");
    expect(link?.className).toContain("bg-background/80");
    expect(link?.className).toContain("text-foreground");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
