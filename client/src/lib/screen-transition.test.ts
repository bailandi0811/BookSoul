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

  it("steps into a book and back out toward the shelf", () => {
    for (const to of ["book", "reader", "workspace"] as const) {
      const shift = screenShift("library", to);
      expect(shift.enter.y).toBeGreaterThan(0);
      expect(shift.enter.x).toBe(0);
      expect(shift.exit.y).toBeLessThan(0);
      expect(shift.duration).toBeGreaterThan(0.3);
    }

    const back = screenShift("reader", "library");
    expect(back.enter.y).toBeLessThan(0);
    expect(back.exit.y).toBeGreaterThan(0);
  });

  it("turns sideways between the reader and the chat", () => {
    const toChat = screenShift("reader", "workspace");
    expect(toChat.enter.x).toBeGreaterThan(0);
    expect(toChat.enter.y).toBe(0);
    expect(toChat.exit.x).toBeLessThan(0);

    const toReader = screenShift("workspace", "reader");
    expect(toReader.enter.x).toBeLessThan(0);
    expect(toReader.exit.x).toBeGreaterThan(0);
  });

  it("drops account settings in from the header", () => {
    const enter = screenShift("library", "account");
    expect(enter.enter.y).toBeLessThan(0);
    expect(enter.enter.x).toBe(0);

    const back = screenShift("account", "library");
    expect(back.enter.y).toBeGreaterThan(0);
    expect(back.exit.y).toBeLessThan(0);
  });

  it("opens the tarot room from the opposite side of the lounge", () => {
    const tarot = screenShift("library", "tarot");
    const back = screenShift("tarot", "library");
    expect(tarot.enter.x).toBeLessThan(0);
    expect(tarot.enter.y).toBe(0);
    expect(back.enter.x).toBeGreaterThan(0);
    expect(Math.sign(tarot.enter.x)).not.toBe(Math.sign(screenShift("library", "community").enter.x));
  });

  it("uses the same vertical step for the landing, sign-in, and the shelf", () => {
    const toAuth = screenShift("landing", "auth");
    expect(toAuth.enter.y).toBeGreaterThan(0);
    expect(toAuth.exit.y).toBeLessThan(0);

    const toLibrary = screenShift("auth", "library");
    expect(toLibrary.enter.y).toBeGreaterThan(0);

    const home = screenShift("library", "landing");
    expect(home.enter.y).toBeLessThan(0);
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
