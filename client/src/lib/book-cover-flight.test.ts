import { afterEach, expect, it, vi } from "vitest";
import {
  beginCoverFlight,
  beginCoverFlightFrom,
  cancelCoverFlight,
  findLandingCover,
  landCoverFlight,
  readRotate,
  watchCoverFlight,
} from "./book-cover-flight";

function stubCover(slot: string, id = "book-1", width = 120, height = 160, left = 40, top = 80) {
  const element = document.createElement("div");
  element.className = "book-cover";
  element.dataset.bookCover = id;
  element.dataset.coverSlot = slot;
  element.textContent = "长夜与春";
  document.body.append(element);
  Object.defineProperty(element, "offsetWidth", { configurable: true, value: width });
  Object.defineProperty(element, "offsetHeight", { configurable: true, value: height });
  element.getBoundingClientRect = () => ({
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON() {},
  });
  return element;
}

afterEach(() => {
  cancelCoverFlight();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it("reads a plane rotation out of a css matrix", () => {
  const radians = (-5 * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  expect(readRotate(`matrix(${cosine}, ${sine}, ${-sine}, ${cosine}, 0, 0)`)).toBeCloseTo(-5, 5);
  expect(readRotate("rotate(-4deg)")).toBe(-4);
  expect(readRotate("none")).toBe(0);
});

it("lands on the shelf when the featured copy has no size yet", () => {
  stubCover("feature", "book-1", 0, 0);
  const shelf = stubCover("shelf");
  expect(findLandingCover("book-1", "library")).toBe(shelf);
});

it("moves the clicked cover onto the destination and then reveals it", async () => {
  const source = stubCover("shelf", "book-1", 140, 186, 20, 30);
  beginCoverFlight(source);
  const flyer = document.querySelector(".book-cover-flyer");
  expect(flyer).toBeInstanceOf(HTMLElement);
  expect(source.classList.contains("book-cover-flight-hidden")).toBe(true);
  expect((flyer as HTMLElement).getAttribute("data-book-cover")).toBeNull();
  const frames: Keyframe[] = [];
  (flyer as HTMLElement).animate = ((keyframes: Keyframe[]) => {
    frames.push(...keyframes);
    return { finished: Promise.resolve({} as Animation) };
  }) as HTMLElement["animate"];
  const target = stubCover("overview", "book-1", 72, 96, 300, 120);
  await landCoverFlight(target);
  expect(target.classList.contains("book-cover-flight-hidden")).toBe(false);
  expect(document.querySelector(".book-cover-flyer")).toBeNull();
  expect(String(frames[1]?.transform)).toContain("translate(246px, 45px)");
  expect(String(frames[1]?.transform)).toContain("scale(");
});

it("does not start a flight when motion is reduced or the cover is not on screen", () => {
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
  const source = stubCover("feature");
  beginCoverFlight(source);
  expect(document.querySelector(".book-cover-flyer")).toBeNull();
  expect(source.classList.contains("book-cover-flight-hidden")).toBe(false);
  vi.restoreAllMocks();
  beginCoverFlightFrom("missing", "shelf");
  expect(document.querySelector(".book-cover-flyer")).toBeNull();
  stubCover("shelf", "tiny", 4, 4);
  beginCoverFlightFrom("tiny", "shelf");
  expect(document.querySelector(".book-cover-flyer")).toBeNull();
});

it("drops the flight when the opened page has no cover to land on", () => {
  const source = stubCover("overview");
  beginCoverFlight(source);
  const page = document.createElement("div");
  page.className = "book-reader-page";
  document.body.append(page);
  const stop = watchCoverFlight("reader", "book-1");
  expect(document.querySelector(".book-cover-flyer")).toBeNull();
  expect(source.classList.contains("book-cover-flight-hidden")).toBe(false);
  stop();
});

it("settles a pending flight onto the cover for the new view", async () => {
  const source = stubCover("overview");
  beginCoverFlight(source);
  const flyer = document.querySelector(".book-cover-flyer") as HTMLElement;
  flyer.animate = (() => ({ finished: Promise.resolve({} as Animation) })) as HTMLElement["animate"];
  stubCover("reader");
  const stop = watchCoverFlight("reader", "book-1");
  await Promise.resolve();
  await Promise.resolve();
  expect(document.querySelector(".book-cover-flyer")).toBeNull();
  stop();
});
