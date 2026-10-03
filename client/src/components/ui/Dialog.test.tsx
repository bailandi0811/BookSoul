import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it("restores focus without scrolling the sidebar when a dialog closes", async () => {
  const trigger = document.createElement("button");
  const container = document.createElement("div");
  document.body.append(trigger, container);
  const root = createRoot(container);
  const closed = vi.fn();
  try {
    trigger.focus();
    const focus = vi.spyOn(trigger, "focus");
    await act(async () =>
      root.render(
        <Dialog open title="书签" onClose={closed}>
          <input aria-label="字段" />
        </Dialog>,
      ),
    );
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () =>
      root.render(
        <Dialog open={false} title="书签" onClose={closed}>
          <input aria-label="字段" />
        </Dialog>,
      ),
    );
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.body.style.overflow).not.toBe("hidden");
    expect(document.activeElement).toBe(trigger);
  } finally {
    await act(async () => root.unmount());
    trigger.remove();
    container.remove();
    vi.restoreAllMocks();
  }
});
