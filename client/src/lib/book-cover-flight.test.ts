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
import { isTransitionBudgetActive, resetTransitionBudgetForTests } from "./transition-budget";

function stubCover(slot: string, id = "book-1", width = 120, height = 160, left = 40, top = 80) {
  const element = document.createElement("div");
  element.className = "book-cover";
  element.dataset.bookCover = id;
  element.dataset.coverSlot = slot;
  element.textContent = "长夜与春";
  // 项目 CSS（.book-cover 的 transform-origin: left center）不会加载进测试环境；
  // happy-dom 对无样式元素的 computed transform-origin 不稳定，而 pivot 数学
  // 依赖它。显式固定为中心，与下面所有期望值的“pivot=0”几何一致。
  element.style.transformOrigin = "50% 50%";
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
  resetTransitionBudgetForTests();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it("freezes only title and imprint styles and holds the flight budget", () => {
  const source = stubCover("shelf");
  source.innerHTML = `
    <span class="book-cover-title">长夜与春</span>
    <span class="book-cover-imprint">BookSoul Library</span>
    <span class="book-cover-spine"></span>
  `;
  const spine = source.querySelector(".book-cover-spine") as HTMLElement;
  const title = source.querySelector(".book-cover-title") as HTMLElement;
  title.style.fontSize = "22px";
  const computed = vi.spyOn(window, "getComputedStyle");
  beginCoverFlight(source);
  const flyer = document.querySelector(".book-cover-flyer") as HTMLElement;
  expect(isTransitionBudgetActive()).toBe(true);
  const scanned = computed.mock.calls.map((call) => (call[0] as Element).className);
  expect(scanned.some((name) => String(name).includes("book-cover-spine"))).toBe(false);
  expect(flyer.querySelector(".book-cover-title")).toMatchObject({ style: { fontSize: "22px" } });
  expect(spine.isConnected).toBe(true);
  cancelCoverFlight();
  expect(isTransitionBudgetActive()).toBe(false);
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
  (flyer as HTMLElement).animate = (() => ({
    finished: Promise.resolve({} as Animation),
  })) as HTMLElement["animate"];
  // Drive the frame-by-frame flight with a synchronous clock.
  let frame = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frame += 120;
    callback(frame);
    return 0;
  });
  const target = stubCover("overview", "book-1", 72, 96, 300, 120);
  await landCoverFlight(target);
  expect(target.classList.contains("book-cover-flight-hidden")).toBe(false);
  expect(document.querySelector(".book-cover-flyer")).toBeNull();
  expect(flyer?.style.transform).toContain("translate(246px, 45px)");
  expect(flyer?.style.transform).toContain("scale(");
});

it("tracks the destination while it keeps moving instead of correcting after landing", async () => {
  const source = stubCover("shelf", "book-1", 140, 186, 20, 30);
  beginCoverFlight(source);
  const flyer = document.querySelector(".book-cover-flyer") as HTMLElement;
  flyer.animate = (() => ({ finished: Promise.resolve({} as Animation) })) as HTMLElement["animate"];
  const target = stubCover("overview", "book-1", 72, 96, 300, 120);
  // The destination page reflows (e.g. font swap) partway through the flight.
  const baseRect = target.getBoundingClientRect();
  let shifted = false;
  target.getBoundingClientRect = () =>
    shifted ? { ...baseRect, x: baseRect.x + 80, left: baseRect.left + 80 } : baseRect;
  let frame = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frame += 120;
    if (frame >= 240) shifted = true;
    callback(frame);
    return 0;
  });
  await landCoverFlight(target);
  expect(target.classList.contains("book-cover-flight-hidden")).toBe(false);
  expect(document.querySelector(".book-cover-flyer")).toBeNull();
  // Arrived at the shifted destination: 246px + the 80px drift.
  expect(flyer.style.transform).toContain("translate(326px, 45px)");
});

it("reproduces a spine-hinged cover exactly when the flight begins", () => {
  const source = stubCover("feature", "book-1", 140, 186, 20, 30);
  source.style.transform = "rotate(-5deg)";
  source.style.transformOrigin = "left center";
  beginCoverFlight(source);
  const flyer = document.querySelector(".book-cover-flyer") as HTMLElement;
  expect(flyer).toBeInstanceOf(HTMLElement);
  // p = (-70, 0): the hinge displacement is p - R·p = (-0.266, -6.101).
  expect(Number.parseFloat(flyer.style.left)).toBeCloseTo(20.2664, 3);
  expect(Number.parseFloat(flyer.style.top)).toBeCloseTo(36.1009, 3);
  const translate = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(flyer.style.transform);
  expect(translate).not.toBeNull();
  expect(Number(translate?.[1])).toBeCloseTo(-0.2664, 3);
  expect(Number(translate?.[2])).toBeCloseTo(-6.1009, 3);
  expect(flyer.style.transform).toContain("rotate(-5deg)");
});

it("carries the hovered shelf tilt into the flight and relaxes it on landing", async () => {
  const source = stubCover("shelf", "book-1", 140, 186, 20, 30);
  source.style.transform = "perspective(650px) translateY(-3px) rotateY(-10deg)";
  source.style.transformOrigin = "left center";
  beginCoverFlight(source);
  const flyer = document.querySelector(".book-cover-flyer") as HTMLElement;
  expect(flyer.style.transform).toContain("perspective(650px)");
  expect(flyer.style.transform).toContain("translateY(-3px)");
  expect(flyer.style.transform).toContain("rotateY(-10deg)");
  flyer.animate = (() => ({ finished: Promise.resolve({} as Animation) })) as HTMLElement["animate"];
  const target = stubCover("overview", "book-1", 72, 96, 300, 120);
  let frame = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frame += 120;
    callback(frame);
    return 0;
  });
  await landCoverFlight(target);
  expect(flyer.style.transform).not.toContain("rotateY(");
  expect(flyer.style.transform).not.toContain("perspective(");
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

it("drops a mid-flight flyer when a new flight begins before it lands", () => {
  const source = stubCover("shelf", "book-1", 140, 186, 20, 30);
  beginCoverFlight(source);
  const flyer = document.querySelector(".book-cover-flyer") as HTMLElement;
  flyer.animate = (() => ({ finished: Promise.resolve({} as Animation) })) as HTMLElement["animate"];
  const target = stubCover("overview", "book-1", 72, 96, 300, 120);
  // The loop stops delivering frames after the first step: the flyer hangs mid-air.
  let frame = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frame += 120;
    if (frame <= 120) callback(frame);
    return 0;
  });
  void landCoverFlight(target);
  expect(target.classList.contains("book-cover-flight-hidden")).toBe(true);

  beginCoverFlight(target);
  expect(flyer.isConnected).toBe(false);
  const flyers = document.querySelectorAll(".book-cover-flyer");
  expect(flyers.length).toBe(1);
  expect(flyers[0]).not.toBe(flyer);
  expect(target.classList.contains("book-cover-flight-hidden")).toBe(true);
});

it("swaps the flyer for the landed cover in the same frame", async () => {
  const source = stubCover("shelf", "book-1", 140, 186, 20, 30);
  beginCoverFlight(source);
  const flyer = document.querySelector(".book-cover-flyer") as HTMLElement;
  flyer.animate = (() => ({ finished: Promise.resolve({} as Animation) })) as HTMLElement["animate"];
  let frame = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frame += 120;
    callback(frame);
    return 0;
  });
  const target = stubCover("overview", "book-1", 72, 96, 300, 120);
  await landCoverFlight(target);
  // 同帧硬切换：落点封面直接显示，flyer 立即移除，无交叉淡出。
  expect(target.classList.contains("book-cover-flight-hidden")).toBe(false);
  expect(flyer.isConnected).toBe(false);
  expect(document.querySelector(".book-cover-flyer")).toBeNull();
});

it("keeps flying toward book space while the library page is still on screen", () => {
  const source = stubCover("shelf", "book-1", 140, 186, 20, 30);
  beginCoverFlight(source);
  watchCoverFlight("book", "book-1");
  expect(document.querySelector(".book-cover-flyer")).not.toBeNull();
  expect(source.classList.contains("book-cover-flight-hidden")).toBe(true);
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

it("flies a paint-slot cover at its painted size so returning does not upscale a blurry raster", () => {
  const slot = document.createElement("div");
  slot.className = "book-cover-paint-slot";
  slot.dataset.bookCover = "book-1";
  slot.dataset.coverSlot = "reader";
  slot.style.transformOrigin = "50% 50%";
  document.body.append(slot);
  Object.defineProperty(slot, "offsetWidth", { configurable: true, value: 76 });
  Object.defineProperty(slot, "offsetHeight", { configurable: true, value: 101 });
  slot.getBoundingClientRect = () => ({
    x: 40,
    y: 80,
    left: 40,
    top: 80,
    right: 116,
    bottom: 181,
    width: 76,
    height: 101,
    toJSON() {},
  });

  const painted = document.createElement("div");
  painted.className = "book-cover";
  painted.textContent = "活着";
  painted.style.transformOrigin = "50% 50%";
  slot.append(painted);
  Object.defineProperty(painted, "offsetWidth", { configurable: true, value: 192 });
  Object.defineProperty(painted, "offsetHeight", { configurable: true, value: 256 });
  painted.getBoundingClientRect = () => ({
    x: 40,
    y: 80,
    left: 40,
    top: 80,
    right: 116,
    bottom: 181,
    width: 76,
    height: 101,
    toJSON() {},
  });

  beginCoverFlight(slot);
  const flyer = document.querySelector(".book-cover-flyer") as HTMLElement;
  expect(flyer.classList.contains("book-cover")).toBe(true);
  expect(flyer.classList.contains("book-cover-paint-slot")).toBe(false);
  expect(flyer.style.width).toBe("192px");
  expect(flyer.style.height).toBe("256px");
  const scale = /scale\(([-\d.]+),\s*([-\d.]+)\)/.exec(flyer.style.transform);
  expect(Number(scale?.[1])).toBeCloseTo(76 / 192, 5);
  expect(Number(scale?.[2])).toBeCloseTo(101 / 256, 5);
});

it("settles a pending flight onto the cover for the new view", async () => {
  const source = stubCover("overview");
  beginCoverFlight(source);
  const flyer = document.querySelector(".book-cover-flyer") as HTMLElement;
  flyer.animate = (() => ({ finished: Promise.resolve({} as Animation) })) as HTMLElement["animate"];
  let frame = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frame += 120;
    callback(frame);
    return 0;
  });
  stubCover("reader");
  const stop = watchCoverFlight("reader", "book-1");
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(document.querySelector(".book-cover-flyer")).toBeNull();
  stop();
});
