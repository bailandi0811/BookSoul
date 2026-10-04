import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LandingPage } from ".";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("LandingPage", () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it("uses the shared scenic backdrop instead of a landing-only scene", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => root!.render(<LandingPage onEnter={vi.fn()} />));

    expect(container.querySelector(".landing-fixed-scene")).toBeNull();
    expect(container.querySelector(".landing-paper-sky")).toBeNull();
    expect(container.querySelector(".landing-page-ribbons")).toBeNull();
    expect(container.querySelector(".landing-fixed-window")).toBeNull();
  });

  it("uses solid paper notes without pasted labels, pill chips, or framing shells", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => root!.render(<LandingPage onEnter={vi.fn()} />));

    expect(container.querySelectorAll(".landing-paper-note")).toHaveLength(3);
    expect(container.querySelector(".landing-stage-surface")).toBeNull();
    expect(container.querySelector(".landing-status-rail")).toBeNull();
    expect(container.querySelector(".landing-stage-label")).toBeNull();
    expect(container.querySelector(".landing-page-strip")).toBeNull();
  });

  it("lets the continue reading preview enter the app flow", async () => {
    const onEnter = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => root!.render(<LandingPage onEnter={onEnter} />));

    const continueReading = container.querySelector<HTMLButtonElement>(
      'button[aria-label="继续阅读《长夜与春》"]',
    );
    expect(continueReading).not.toBeNull();

    await act(async () => continueReading!.click());

    expect(onEnter).toHaveBeenCalledTimes(1);
  });
});
