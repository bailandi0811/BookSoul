const HIDDEN = "book-cover-flight-hidden";
const FLYER = "book-cover-flyer";
const FLIGHT_MS = 580;
const SETTLE_MS = 200;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

export const COVER_SLOTS = ["feature", "shelf", "overview", "reader", "chat", "chat-welcome"] as const;
export type CoverSlot = (typeof COVER_SLOTS)[number];

export type CoverBox = {
  left: number;
  top: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
  rotate: number;
};

type Flight = { bookId: string; flyer: HTMLElement; from: CoverBox };

function flightTransform(box: CoverBox, from: CoverBox) {
  const sx = box.width / from.width;
  const sy = box.height / from.height;
  return `translate(${box.cx - from.cx}px, ${box.cy - from.cy}px) rotate(${box.rotate}deg) scale(${sx}, ${sy})`;
}

function sameBox(a: CoverBox, b: CoverBox) {
  return Math.abs(a.cx - b.cx) < 0.5
    && Math.abs(a.cy - b.cy) < 0.5
    && Math.abs(a.width - b.width) < 0.5
    && Math.abs(a.height - b.height) < 0.5
    && Math.abs(a.rotate - b.rotate) < 0.4;
}

const LANDING: Record<string, readonly CoverSlot[]> = {
  library: ["feature", "shelf"],
  book: ["overview"],
  reader: ["reader"],
  workspace: ["chat", "chat-welcome"],
};

const PAGE: Record<string, string> = {
  library: "[data-cover-slot='feature'], [data-cover-slot='shelf'], .library-empty",
  book: ".book-space-page",
  reader: ".book-reader-page",
  workspace: ".workspace-page",
};

let active: Flight | null = null;
let flightToken = 0;

export function readRotate(transform: string): number {
  if (!transform || transform === "none") return 0;
  const rotateFn = /(?:^|\s)rotate\(([-\d.]+)deg\)/.exec(transform);
  if (rotateFn) return Number(rotateFn[1]);
  const matrix3d = /matrix3d\(([^)]+)\)/.exec(transform);
  const matrix = matrix3d ?? /matrix\(([^)]+)\)/.exec(transform);
  if (!matrix) return 0;
  const [a, b] = matrix[1].split(",").map((part) => Number(part.trim()));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  const degrees = (Math.atan2(b, a) * 180) / Math.PI;
  return Math.abs(degrees) < 0.5 ? 0 : degrees;
}

export function readCoverBox(element: HTMLElement): CoverBox {
  const rect = element.getBoundingClientRect();
  const width = element.offsetWidth || rect.width;
  const height = element.offsetHeight || rect.height;
  let rotate = 0;
  let node: HTMLElement | null = element;
  while (node && node !== document.documentElement) {
    rotate += readRotate(getComputedStyle(node).transform);
    node = node.parentElement;
  }
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return {
    left: cx - width / 2,
    top: cy - height / 2,
    width,
    height,
    cx,
    cy,
    rotate,
  };
}

function cssAttr(value: string) {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function findCover(bookId: string, slot: CoverSlot, root: ParentNode = document): HTMLElement | null {
  const element = root.querySelector(`[data-book-cover="${cssAttr(bookId)}"][data-cover-slot="${slot}"]:not(.${FLYER})`);
  return element instanceof HTMLElement ? element : null;
}

export function findLandingCover(bookId: string, view: string, root: ParentNode = document): HTMLElement | null {
  for (const slot of LANDING[view] ?? []) {
    const element = findCover(bookId, slot, root);
    if (element && element.offsetWidth >= 8 && element.offsetHeight >= 8) return element;
  }
  return null;
}

function reducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function placeFlyer(flyer: HTMLElement, box: CoverBox) {
  flyer.style.left = `${box.left}px`;
  flyer.style.top = `${box.top}px`;
  flyer.style.width = `${box.width}px`;
  flyer.style.height = `${box.height}px`;
  flyer.style.transformOrigin = "center center";
  flyer.style.transform = `translate(0px, 0px) rotate(${box.rotate}deg) scale(1)`;
}

/** Parent rules (feature tilt, shelf type size) do not apply once the copy leaves the shelf. */
function freezeLook(source: HTMLElement, flyer: HTMLElement) {
  const root = getComputedStyle(source);
  flyer.style.backgroundColor = root.backgroundColor;
  flyer.style.borderRadius = root.borderRadius;
  flyer.style.boxShadow = root.boxShadow;
  const sources = [source, ...source.querySelectorAll<HTMLElement>("*")];
  const copies = [flyer, ...flyer.querySelectorAll<HTMLElement>("*")];
  sources.forEach((node, index) => {
    const copy = copies[index];
    if (!copy || copy === flyer) return;
    const style = getComputedStyle(node);
    copy.style.fontSize = style.fontSize;
    copy.style.fontFamily = style.fontFamily;
    copy.style.lineHeight = style.lineHeight;
    copy.style.letterSpacing = style.letterSpacing;
  });
}

export function peekCoverFlight() {
  return active;
}

export function cancelCoverFlight() {
  flightToken += 1;
  active?.flyer.remove();
  active = null;
  document.querySelectorAll(`.${HIDDEN}`).forEach((element) => element.classList.remove(HIDDEN));
}

export function beginCoverFlight(cover: HTMLElement | null | undefined) {
  if (!cover || reducedMotion()) return;
  const bookId = cover.dataset.bookCover;
  if (!bookId) return;
  const from = readCoverBox(cover);
  if (from.width < 8 || from.height < 8) return;
  cancelCoverFlight();
  const flyer = cover.cloneNode(true) as HTMLElement;
  flyer.classList.add(FLYER);
  flyer.classList.remove(HIDDEN);
  flyer.removeAttribute("data-book-cover");
  flyer.removeAttribute("data-cover-slot");
  flyer.setAttribute("aria-hidden", "true");
  freezeLook(cover, flyer);
  placeFlyer(flyer, from);
  document.body.append(flyer);
  cover.classList.add(HIDDEN);
  active = { bookId, flyer, from };
}

export function beginCoverFlightFrom(bookId: string, slot: CoverSlot) {
  beginCoverFlight(findCover(bookId, slot));
}

export function landCoverFlight(target: HTMLElement) {
  const flight = active;
  if (!flight) return Promise.resolve();
  active = null;
  const token = flightToken;
  target.classList.add(HIDDEN);
  const to = readCoverBox(target);
  const finish = () => {
    if (token !== flightToken) return;
    target.classList.remove(HIDDEN);
    flight.flyer.remove();
  };
  if (typeof flight.flyer.animate !== "function" || to.width < 8) {
    finish();
    return Promise.resolve();
  }
  return flight.flyer
    .animate(
      [
        { transform: flightTransform(flight.from, flight.from) },
        { transform: flightTransform(to, flight.from) },
      ],
      { duration: FLIGHT_MS, easing: EASE, fill: "forwards" },
    )
    .finished.then(() => settleCover(flight, to, target, token, finish), finish);
}

/** Ease the last few pixels onto a fresh measurement, then fade into the real cover. */
function settleCover(
  flight: Flight,
  to: CoverBox,
  target: HTMLElement,
  token: number,
  finish: () => void,
) {
  if (token !== flightToken) return;
  const fresh = readCoverBox(target);
  const handoff = () => {
    if (token !== flightToken) return;
    target.classList.remove(HIDDEN);
    return flight.flyer
      .animate(
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: SETTLE_MS, easing: "ease-out", fill: "forwards" },
      )
      .finished.then(finish, finish);
  };
  if (sameBox(fresh, to) || typeof flight.flyer.animate !== "function") return handoff();
  return flight.flyer
    .animate(
      [
        { transform: flightTransform(to, flight.from) },
        { transform: flightTransform(fresh, flight.from) },
      ],
      { duration: 240, easing: EASE, fill: "forwards" },
    )
    .finished.then(handoff, finish);
}

/** Watches until the destination cover is in the layout, then runs the flight. */
export function watchCoverFlight(view: string, bookId: string | null) {
  const pending = peekCoverFlight();
  if (!pending) return () => {};
  if (bookId && pending.bookId !== bookId) {
    cancelCoverFlight();
    return () => {};
  }
  let stopped = false;
  let frame = 0;
  let timer = 0;
  const started = performance.now();
  const attempt = () => {
    if (stopped || peekCoverFlight() !== pending) return true;
    const target = findLandingCover(pending.bookId, view);
    if (target) {
      stopped = true;
      void landCoverFlight(target);
      return true;
    }
    const page = PAGE[view];
    if (page && document.querySelector(page)) {
      stopped = true;
      cancelCoverFlight();
      return true;
    }
    return false;
  };
  if (!attempt()) {
    const loop = () => {
      if (stopped) return;
      if (attempt()) return;
      if (performance.now() - started >= 800) {
        stopped = true;
        if (peekCoverFlight() === pending) cancelCoverFlight();
        return;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    timer = window.setTimeout(() => {
      if (stopped) return;
      stopped = true;
      if (peekCoverFlight() === pending) cancelCoverFlight();
    }, 800);
  }
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
    window.clearTimeout(timer);
  };
}
