import { act, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useCommunityStore } from "@/store/useCommunityStore";
import { useCommunityVisibleRead } from "./useCommunityVisibleRead";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
function Harness() {
  const ref = useRef<HTMLDivElement>(null);
  useCommunityVisibleRead(ref, "fixture");
  return (
    <div id="viewport" ref={ref}>
      <article data-community-message="visible" />
      <article data-community-message="offscreen" />
    </div>
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(
    useCommunityStore.getState(),
    "markVisibleTailRead",
  ).mockResolvedValue();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function () {
      const top = this.dataset.communityMessage === "offscreen" ? 400 : 0;
      const height = this.id === "viewport" ? 300 : 200;
      return {
        top,
        bottom: top + height,
        height,
        left: 0,
        right: 300,
        width: 300,
        x: 0,
        y: top,
        toJSON: () => ({}),
      };
    },
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  useCommunityStore.getState().clearForIdentityChange();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("confirms only messages that remain in the viewport for the dwell interval", async () => {
  act(() => root.render(<Harness />));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
  expect(useCommunityStore.getState().visibleMessageIds).toEqual([]);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
  expect(useCommunityStore.getState().visibleMessageIds).toEqual(["visible"]);
});
it("hiding the page cancels pending dwell instead of reading unseen messages", async () => {
  act(() => root.render(<Harness />));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(useCommunityStore.getState().visibleMessageIds).toEqual([]);
});
