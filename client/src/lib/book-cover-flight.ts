import { holdFlightBudget, releaseFlightBudget } from "./transition-budget";

const HIDDEN = "book-cover-flight-hidden";
const FLYER = "book-cover-flyer";
/** Main shelf-to-slot flight; slightly longer so chunk load can overlap the motion. */
const FLIGHT_MS = 720;
const DEPARTURE_MS = 420;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

export const COVER_SLOTS = ["feature", "shelf", "overview", "reader", "chat", "chat-welcome"] as const;
export type CoverSlot = (typeof COVER_SLOTS)[number];

export type CoverTilt = {
  /** rotateY angle in degrees, from the hovered shelf tilt. */
  ry: number;
  /** translateY offset in px. */
  ty: number;
  /** perspective distance in px; 0 when there is no 3D tilt. */
  persp: number;
};

export type CoverBox = {
  left: number;
  top: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
  rotate: number;
  /** Own transform-origin relative to the element centre; covers hinge on the spine. */
  pivotX: number;
  pivotY: number;
  tilt: CoverTilt;
};

type CoverPaint = { width: number; height: number };

type Flight = {
  bookId: string;
  flyer: HTMLElement;
  from: CoverBox;
  paint: CoverPaint;
  launchBox: CoverBox | null;
  departing: boolean;
};

function departureLift(from: CoverBox): CoverBox {
  const scale = 1.045;
  const width = from.width * scale;
  const height = from.height * scale;
  const cy = from.cy - 14;
  const cx = from.cx;
  return {
    ...from,
    width,
    height,
    left: cx - width / 2,
    top: cy - height / 2,
    cx,
    cy,
    tilt: { ry: 0, ty: from.tilt.ty - 6, persp: from.tilt.persp },
  };
}

function flightLaunchBox(flight: Flight) {
  return flight.launchBox ?? flight.from;
}

function startDepartureLoop(token: number) {
  const flight = active;
  if (!flight || token !== flightToken) return;
  const lift = departureLift(flight.from);
  flight.departing = true;
  let started: number | null = null;
  const step = (now: number) => {
    if (token !== flightToken || active !== flight || !flight.departing) return;
    if (started === null) started = now;
    const progress = Math.min(1, (now - started) / DEPARTURE_MS);
    const box = lerpCoverBox(flight.from, lift, easeOutQuint(progress));
    flight.launchBox = box;
    flight.flyer.style.transform = flightTransform(box, flight.from, flight.paint);
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function paintedCover(cover: HTMLElement) {
  return cover.querySelector<HTMLElement>(":scope > .book-cover") ?? cover;
}

function lerp(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

/**
 * Rotation about the cover's own pivot equals rotation about the centre plus
 * the translation `p - M·p` (p = pivot relative to centre, M = plane matrix).
 */
function pivotCorrection(box: CoverBox, sx: number, sy: number) {
  const radians = (box.rotate * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const mx = cos * sx * box.pivotX - sin * sy * box.pivotY;
  const my = sin * sx * box.pivotX + cos * sy * box.pivotY;
  return { x: box.pivotX - mx, y: box.pivotY - my };
}

function tiltTransform(tilt: CoverTilt) {
  // A perspective alone with no rotation or lift is a visual no-op.
  if (Math.abs(tilt.ry) < 0.05 && Math.abs(tilt.ty) < 0.05) return "";
  const persp = tilt.persp ? `perspective(${tilt.persp}px) ` : "";
  return `${persp}translateY(${tilt.ty}px) rotateY(${tilt.ry}deg) `;
}

/**
 * The flyer sits at the source cover's untransformed layout position; each
 * frame it carries `lerped centre − source centre` plus the spine tilt, so
 * both endpoints reproduce the real covers exactly (hinged rotation and all).
 */
/** Perspective magnifies the near edge of a rotateY tilt, shifting the
 * projected centre toward the viewer's side. box.cx is measured from that
 * projected bounding box while the flyer re-applies the tilt, so the
 * translate must compensate for the shift to keep takeoff seam-free. */
function tiltCenterShiftX(tilt: CoverTilt, width: number) {
  if (!tilt.ry || !tilt.persp) return 0;
  const edge = width / 2;
  const rad = (tilt.ry * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const near = edge * cos * (tilt.persp / (tilt.persp + edge * sin));
  const far = -edge * cos * (tilt.persp / (tilt.persp - edge * sin));
  return (near + far) / 2;
}

function flightTransform(box: CoverBox, from: CoverBox, paint: CoverPaint) {
  const sx = box.width / paint.width;
  const sy = box.height / paint.height;
  const base = pivotCorrection(from, 1, 1);
  // box.top/cx 测自投影包围盒，已含倾斜自身的位移与透视偏心；
  // transform 会再次施加倾斜，translate 需反向补偿，起飞帧才能与真实封面投影重合。
  const dx = box.left + box.width / 2 - (from.left - base.x) - from.width / 2 - tiltCenterShiftX(box.tilt, box.width);
  const dy = box.top + box.height / 2 - (from.top - base.y) - from.height / 2 - box.tilt.ty;
  return `translate(${dx}px, ${dy}px) ${tiltTransform(box.tilt)}rotate(${box.rotate}deg) scale(${sx}, ${sy})`;
}

/** The layout position that makes the pivot-corrected transform reproduce the cover's real projection. */
function flightLeft(box: CoverBox, paint: CoverPaint, sx: number, sy: number) {
  const pivot = pivotCorrection(box, sx, sy);
  return {
    left: box.left + (box.width - paint.width) / 2 - pivot.x,
    top: box.top + (box.height - paint.height) / 2 - pivot.y,
  };
}

/** The quintic form of the landing ease, matching EASE for the frame-by-frame flight. */
function easeOutQuint(progress: number) {
  return 1 - Math.pow(1 - progress, 5);
}

function lerpCoverBox(from: CoverBox, to: CoverBox, progress: number): CoverBox {
  return {
    left: lerp(from.left, to.left, progress),
    top: lerp(from.top, to.top, progress),
    width: lerp(from.width, to.width, progress),
    height: lerp(from.height, to.height, progress),
    cx: lerp(from.cx, to.cx, progress),
    cy: lerp(from.cy, to.cy, progress),
    rotate: lerp(from.rotate, to.rotate, progress),
    pivotX: lerp(from.pivotX, to.pivotX, progress),
    pivotY: lerp(from.pivotY, to.pivotY, progress),
    tilt: {
      ry: lerp(from.tilt.ry, to.tilt.ry, progress),
      ty: lerp(from.tilt.ty, to.tilt.ty, progress),
      persp: to.tilt.persp || from.tilt.persp,
    },
  };
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
  // 空会话时页面中央的欢迎封面才是视觉主角，优先落它；
  // 有历史消息时欢迎封面不存在，自然回落到侧栏封面。
  workspace: ["chat-welcome", "chat"],
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
  const own = getComputedStyle(element).transform;
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
    ...readPivot(element, width, height),
    tilt: readTilt(own),
  };
}

function resolveOriginAxis(value: string, size: number): number {
  const keyword = value.trim();
  if (keyword === "left" || keyword === "top") return 0;
  if (keyword === "center") return size / 2;
  if (keyword === "right" || keyword === "bottom") return size;
  const percent = /^([-\d.]+)%$/.exec(keyword);
  if (percent) return (Number(percent[1]) / 100) * size;
  return Number.parseFloat(keyword) || 0;
}

/** Covers hinge around their spine (`left center`), so the flight must rotate around the same pivot. */
function readPivot(element: HTMLElement, width: number, height: number) {
  const [originX, originY] = getComputedStyle(element).transformOrigin.split(" ");
  const pivotX = resolveOriginAxis(originX ?? "center", width) - width / 2;
  const pivotY = resolveOriginAxis(originY ?? "center", height) - height / 2;
  return { pivotX, pivotY };
}

/** Decomposes the hovered shelf tilt (perspective translateY rotateY) from a transform. */
function readTilt(transform: string): CoverTilt {
  const perspFn = /perspective\(([-\d.]+)px\)/.exec(transform);
  const tyFn = /translateY\(([-\d.]+)px\)/.exec(transform);
  const ryFn = /rotateY\(([-\d.]+)deg\)/.exec(transform);
  if (perspFn || ryFn) {
    return {
      persp: perspFn ? Number(perspFn[1]) : 0,
      ty: tyFn ? Number(tyFn[1]) : 0,
      ry: ryFn ? Number(ryFn[1]) : 0,
    };
  }
  // Browsers report 3D transforms as matrix3d; perspective(d) yields m34 = -1/d.
  const values = /matrix3d\(([^)]+)\)/.exec(transform)?.[1]?.split(",").map((part) => Number(part.trim()));
  if (!values || values.length !== 16 || !values.every((value) => Number.isFinite(value))) {
    return { ry: 0, ty: 0, persp: 0 };
  }
  const [m11, , m13, , , , , , , , , m34, , m42] = values;
  const ry = (Math.atan2(m13, m11) * 180) / Math.PI;
  const persp = m34 < -1e-6 ? -1 / m34 : 0;
  return { ry: Math.abs(ry) < 0.5 ? 0 : ry, ty: m42, persp };
}

function cssAttr(value: string) {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function findCover(bookId: string, slot: CoverSlot, root: ParentNode = document): HTMLElement | null {
  const element = root.querySelector(
    `[data-book-cover="${cssAttr(bookId)}"][data-cover-slot="${slot}"]:not(.${FLYER}):not(.${HIDDEN})`,
  );
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

function placeFlyer(flyer: HTMLElement, box: CoverBox, paint: CoverPaint) {
  const place = flightLeft(box, paint, 1, 1);
  flyer.style.left = `${place.left}px`;
  flyer.style.top = `${place.top}px`;
  flyer.style.width = `${paint.width}px`;
  flyer.style.height = `${paint.height}px`;
  flyer.style.transformOrigin = "center center";
  flyer.style.transform = flightTransform(box, box, paint);
}

/** Parent rules (feature tilt, shelf type size) do not apply once the copy leaves the shelf. */
function freezeLook(source: HTMLElement, flyer: HTMLElement) {
  const root = getComputedStyle(source);
  flyer.style.backgroundColor = root.backgroundColor;
  flyer.style.borderRadius = root.borderRadius;
  flyer.style.boxShadow = root.boxShadow;
  for (const name of ["book-cover-title", "book-cover-imprint"]) {
    const from = source.querySelector<HTMLElement>(`.${name}`);
    const to = flyer.querySelector<HTMLElement>(`.${name}`);
    if (!from || !to) continue;
    const style = getComputedStyle(from);
    to.style.fontSize = style.fontSize;
    to.style.fontFamily = style.fontFamily;
    to.style.lineHeight = style.lineHeight;
    to.style.letterSpacing = style.letterSpacing;
  }
}

export function peekCoverFlight() {
  return active;
}

export function cancelCoverFlight() {
  flightToken += 1;
  active = null;
  // A landing flight has already cleared `active` while its flyer is still
  // mid-air; removing every flyer here guarantees none is orphaned by the
  // token bump in the landing callbacks.
  document.querySelectorAll(`.${FLYER}`).forEach((element) => element.remove());
  document.querySelectorAll(`.${HIDDEN}`).forEach((element) => element.classList.remove(HIDDEN));
  releaseFlightBudget();
}

export function beginCoverFlight(cover: HTMLElement | null | undefined) {
  if (!cover || reducedMotion()) return;
  const bookId = cover.dataset.bookCover;
  if (!bookId) return;
  const from = readCoverBox(cover);
  if (from.width < 8 || from.height < 8) return;
  const painted = paintedCover(cover);
  const paint = {
    width: painted.offsetWidth || from.width,
    height: painted.offsetHeight || from.height,
  };
  if (paint.width < 8 || paint.height < 8) return;
  cancelCoverFlight();
  const flyer = painted.cloneNode(true) as HTMLElement;
  flyer.classList.add(FLYER);
  flyer.classList.remove(HIDDEN);
  flyer.removeAttribute("data-book-cover");
  flyer.removeAttribute("data-cover-slot");
  flyer.setAttribute("aria-hidden", "true");
  freezeLook(painted, flyer);
  placeFlyer(flyer, from, paint);
  document.body.append(flyer);
  cover.classList.add(HIDDEN);
  active = { bookId, flyer, from, paint, launchBox: null, departing: false };
  holdFlightBudget();
  startDepartureLoop(flightToken);
}

export function beginCoverFlightFrom(bookId: string, slot: CoverSlot) {
  beginCoverFlight(findCover(bookId, slot));
}

export function landCoverFlight(target: HTMLElement) {
  const flight = active;
  if (!flight) return Promise.resolve();
  flight.departing = false;
  active = null;
  const token = flightToken;
  const launch = flightLaunchBox(flight);
  target.classList.add(HIDDEN);
  const to = readCoverBox(target);
  const finish = () => {
    if (token !== flightToken) return;
    target.classList.remove(HIDDEN);
    flight.flyer.remove();
    releaseFlightBudget();
  };
  if (typeof flight.flyer.animate !== "function" || to.width < 8) {
    finish();
    return Promise.resolve();
  }
  // The destination page can still be settling (fonts, async content,
  // entrance animations), so track its live box every frame instead of
  // committing to a stale measurement and correcting visibly afterwards.
  return new Promise<void>((resolve) => {
    let started: number | null = null;
    let box = to;
    const step = (now: number) => {
      if (token !== flightToken) {
        resolve();
        return;
      }
      if (started === null) started = now;
      const fresh = readCoverBox(target);
      if (fresh.width >= 8) box = fresh;
      const progress = Math.min(1, (now - started) / FLIGHT_MS);
      flight.flyer.style.transform = flightTransform(
        lerpCoverBox(launch, box, easeOutQuint(progress)),
        flight.from,
        flight.paint,
      );
      if (progress < 1) {
        requestAnimationFrame(step);
        return;
      }
      void Promise.resolve(
        settleCover(flight, box, target, token, finish),
      ).then(resolve, resolve);
    };
    requestAnimationFrame(step);
  });
}

/** Snap onto a fresh measurement, then swap in the real cover.
 * The flyer and the landed cover are style- and pixel-aligned (verified to
 * sub-pixel in a real browser), so a crossfade would only double-render the
 * shadow and text for its whole duration — swap within the same frame. */
function settleCover(
  flight: Flight,
  to: CoverBox,
  target: HTMLElement,
  token: number,
  finish: () => void,
) {
  if (token !== flightToken) return;
  const fresh = readCoverBox(target);
  if (sameBox(fresh, to)) return finish();
  const from = flight.from;
  return flight.flyer
    .animate(
      [
        { transform: flightTransform(to, from, flight.paint) },
        { transform: flightTransform(fresh, from, flight.paint) },
      ],
      { duration: 240, easing: EASE, fill: "forwards" },
    )
    .finished.then(finish, finish);
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
