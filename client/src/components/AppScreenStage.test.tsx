import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { AppScreenStage } from "./AppScreenStage";
import type { ScreenShift } from "@/lib/screen-transition";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const shift: ScreenShift = {
  enter: { opacity: 0, x: 0, y: 0 },
  exit: { opacity: 0, x: 0, y: 0 },
  duration: 0.4,
  ease: [0.22, 1, 0.36, 1],
};

it("keeps the first screen settled and freezes a screen that is leaving", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(
        <AppScreenStage screenKey="library" shift={shift}>
          <p>书架</p>
        </AppScreenStage>,
      );
    });
    const first = container.querySelector(".app-screen");
    expect(container.querySelector(".app-stage")).not.toBeNull();
    expect(first?.getAttribute("data-present")).toBe("true");
    expect(first?.getAttribute("data-moving")).toBe("false");
    expect(document.body.style.overflow).toBe("hidden");

    await act(async () => {
      root.render(
        <AppScreenStage screenKey="book" shift={shift}>
          <p>本书</p>
        </AppScreenStage>,
      );
    });

    const screens = [...container.querySelectorAll(".app-screen")];
    expect(screens.filter((screen) => screen.getAttribute("data-present") === "true")).toHaveLength(1);
    const present = screens.find((screen) => screen.getAttribute("data-present") === "true");
    expect(present?.textContent).toContain("本书");
    for (const screen of screens) {
      if (screen.getAttribute("data-present") === "false") {
        expect(screen.hasAttribute("inert")).toBe(true);
        expect(screen.getAttribute("aria-hidden")).toBe("true");
        expect(screen.getAttribute("data-moving")).toBe("false");
      }
    }
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
