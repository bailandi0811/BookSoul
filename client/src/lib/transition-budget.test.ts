import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginTransitionBudget,
  endTransitionBudget,
  holdFlightBudget,
  holdScreenBudget,
  isTransitionBudgetActive,
  releaseFlightBudget,
  releaseScreenBudget,
  resetTransitionBudgetForTests,
  scheduleScreenChange,
  flushScheduledScreenChange,
} from "./transition-budget";

afterEach(() => {
  resetTransitionBudgetForTests();
  vi.restoreAllMocks();
});

describe("transition budget", () => {
  it("keeps screen-moving until the last lease ends", () => {
    beginTransitionBudget();
    beginTransitionBudget();
    endTransitionBudget();
    expect(isTransitionBudgetActive()).toBe(true);
    expect(document.documentElement.classList.contains("screen-moving")).toBe(true);
    endTransitionBudget();
    expect(isTransitionBudgetActive()).toBe(false);
    expect(document.documentElement.classList.contains("screen-moving")).toBe(false);
  });

  it("does not increment a flight or screen lease twice", () => {
    holdFlightBudget();
    holdFlightBudget();
    releaseFlightBudget();
    expect(isTransitionBudgetActive()).toBe(false);
    holdScreenBudget();
    holdScreenBudget();
    releaseScreenBudget();
    expect(isTransitionBudgetActive()).toBe(false);
  });

  it("runs stacked screen changes on the next frame only", () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const seen: string[] = [];
    scheduleScreenChange(() => seen.push("first"));
    scheduleScreenChange(() => seen.push("second"));
    expect(seen).toEqual([]);
    expect(isTransitionBudgetActive()).toBe(true);
    expect(frames).toHaveLength(1);
    frames[0](0);
    expect(seen).toEqual(["first", "second"]);
  });

  it("keeps later screen changes on the same scheduled frame", () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    let account = true;
    let entered = true;
    scheduleScreenChange(() => {
      account = false;
      entered = false;
    });
    expect(account).toBe(true);
    frames[0](0);
    expect(account).toBe(false);
    expect(entered).toBe(false);
  });

  it("drains nested scheduleScreenChange calls on the same frame", () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const seen: string[] = [];
    scheduleScreenChange(() => {
      seen.push("outer");
      scheduleScreenChange(() => seen.push("inner"));
    });
    expect(seen).toEqual([]);
    expect(frames).toHaveLength(1);
    frames[0](0);
    expect(seen).toEqual(["outer", "inner"]);
    expect(frames).toHaveLength(1);
  });

  it("flushes queued screen changes without waiting for the next frame", () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const seen: string[] = [];
    scheduleScreenChange(() => seen.push("first"));
    scheduleScreenChange(() => seen.push("second"));
    expect(seen).toEqual([]);
    expect(frames).toHaveLength(1);
    flushScheduledScreenChange();
    expect(seen).toEqual(["first", "second"]);
    expect(frames).toHaveLength(1);
  });

  it("ignores extra end calls and missing document", () => {
    endTransitionBudget();
    expect(isTransitionBudgetActive()).toBe(false);
    const html = document.documentElement;
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
    Object.defineProperty(globalThis, "document", { configurable: true, value: undefined });
    expect(() => {
      beginTransitionBudget();
      endTransitionBudget();
    }).not.toThrow();
    Object.defineProperty(globalThis, "document", descriptor ?? { configurable: true, value: { documentElement: html } });
  });
});
