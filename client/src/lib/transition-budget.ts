const CLASS = "screen-moving";

let leases = 0;
let flightHeld = false;
let screenHeld = false;
let pending: Array<() => void> = [];
let frame = 0;
let draining = false;

function root() {
  return typeof document !== "undefined" ? document.documentElement : null;
}

function syncClass() {
  const html = root();
  if (!html) return;
  html.classList.toggle(CLASS, leases > 0);
}

export function isTransitionBudgetActive() {
  return leases > 0;
}

export function beginTransitionBudget() {
  leases += 1;
  syncClass();
}

export function endTransitionBudget() {
  if (leases === 0) return;
  leases -= 1;
  syncClass();
}

export function holdFlightBudget() {
  if (flightHeld) return;
  flightHeld = true;
  beginTransitionBudget();
}

export function releaseFlightBudget() {
  if (!flightHeld) return;
  flightHeld = false;
  endTransitionBudget();
}

export function holdScreenBudget() {
  if (screenHeld) return;
  screenHeld = true;
  beginTransitionBudget();
}

export function releaseScreenBudget() {
  if (!screenHeld) return;
  screenHeld = false;
  endTransitionBudget();
}

function drainPending() {
  draining = true;
  try {
    while (pending.length) {
      const queue = pending;
      pending = [];
      for (const item of queue) item();
    }
  } finally {
    draining = false;
  }
}

export function scheduleScreenChange(apply: () => void) {
  holdScreenBudget();
  pending.push(apply);
  if (frame || draining) return;
  const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0);
  frame = raf(() => {
    frame = 0;
    drainPending();
  }) as number;
}

export function flushScheduledScreenChange() {
  if (frame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
  frame = 0;
  drainPending();
}

export function resetTransitionBudgetForTests() {
  if (frame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
  frame = 0;
  pending = [];
  draining = false;
  flightHeld = false;
  screenHeld = false;
  leases = 0;
  root()?.classList.remove(CLASS);
}
