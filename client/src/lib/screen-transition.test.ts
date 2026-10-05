import { describe, expect, it } from "vitest";
import { screenShift } from "./screen-transition";

describe("screenShift", () => {
  it("steps down into the library and back up to the landing", () => {
    const enter = screenShift("landing", "library");
    expect(enter.enter.y).toBeGreaterThan(0);
    expect(enter.exit.y).toBeLessThan(0);
    expect(enter.duration).toBeGreaterThan(0.18);

    const back = screenShift("library", "landing");
    expect(back.enter.y).toBeLessThan(0);
    expect(back.exit.y).toBeGreaterThan(0);
  });

  it("slides into the lounge from the right and returns toward the shelf", () => {
    const enter = screenShift("library", "community");
    expect(enter.enter.x).toBeGreaterThan(0);
    expect(enter.exit.x).toBeLessThan(0);
    expect(enter.enter.y).toBe(0);

    const back = screenShift("community", "library");
    expect(back.enter.x).toBeLessThan(0);
    expect(back.exit.x).toBeGreaterThan(0);
  });

  it("keeps book screens on a short fade so the cover flight stays the motion", () => {
    for (const to of ["book", "reader", "workspace"] as const) {
      const shift = screenShift("library", to);
      expect(shift.enter).toEqual({ opacity: 0, x: 0, y: 0 });
      expect(shift.duration).toBe(0.18);
    }
  });

  it("fades the page behind a cover flight instead of cutting to it", () => {
    const shift = screenShift("library", "book", false, true);
    expect(shift.duration).toBeGreaterThan(0.18);
    expect(shift.enter).toEqual({ opacity: 0, x: 0, y: 0 });
    expect(shift.enter.x).toBe(0);
    expect(shift.enter.y).toBe(0);
  });

  it("drops the travel when reduced motion is requested", () => {
    const shift = screenShift("library", "community", true);
    expect(shift.enter.x).toBe(0);
    expect(shift.exit.x).toBe(0);
    expect(shift.duration).toBeLessThan(0.18);
  });
});
