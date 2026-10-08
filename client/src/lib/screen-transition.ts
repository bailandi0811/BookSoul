import type { AppScreen } from "./app-flow";
import { PAPER_EASE } from "./ui-motion";

export type ScreenOffset = {
  opacity: number;
  x: number;
  y: number;
};

export type ScreenShift = {
  enter: ScreenOffset;
  exit: ScreenOffset;
  duration: number;
  ease: readonly [number, number, number, number];
};

const fade = (duration: number): ScreenShift => ({
  enter: { opacity: 0, x: 0, y: 0 },
  exit: { opacity: 0, x: 0, y: 0 },
  duration,
  ease: PAPER_EASE,
});

/** Deeper screens step forward. Side rooms share a floor so they travel sideways. */
const DEPTH: Record<AppScreen, number> = {
  landing: 0,
  loading: 0,
  "reset-password": 0,
  auth: 1,
  library: 2,
  account: 3,
  community: 3,
  tarot: 3,
  book: 4,
  reader: 5,
  workspace: 5,
};

let publishedShift: ScreenShift | null = null;

/** The leaving screen is frozen with its old props, so the live transition is read at animation time. */
export function publishScreenShift(shift: ScreenShift) {
  publishedShift = shift;
}

export function currentScreenShift() {
  return publishedShift;
}

function doorRank(screen: AppScreen) {
  if (screen === "landing") return 0;
  if (screen === "auth") return 1;
  if (screen === "library") return 2;
  return null;
}

/** Landing, sign-in, and the shelf share one vertical step, matched to the slow scene veil. */
function studyDoor(intoStudy: boolean): ScreenShift {
  return {
    enter: { opacity: 0, x: 0, y: intoStudy ? 28 : -20 },
    exit: { opacity: 0, x: 0, y: intoStudy ? -16 : 22 },
    duration: 0.56,
    ease: PAPER_EASE,
  };
}

/** A side room drifts in from one wing. `fromRight` keeps the lounge and the tarot room on opposite sides. */
function lateral(intoRoom: boolean, fromRight: boolean): ScreenShift {
  const direction = (intoRoom ? 1 : -1) * (fromRight ? 1 : -1);
  return {
    enter: { opacity: 0, x: direction * 32, y: 0 },
    exit: { opacity: 0, x: direction * -20, y: 0 },
    duration: 0.48,
    ease: PAPER_EASE,
  };
}

/** Account hangs off the header, so it drops in and lifts back out. */
function accountDoor(intoAccount: boolean): ScreenShift {
  return {
    enter: { opacity: 0, x: 0, y: intoAccount ? -24 : 20 },
    exit: { opacity: 0, x: 0, y: intoAccount ? 16 : -18 },
    duration: 0.46,
    ease: PAPER_EASE,
  };
}

/** Reader and chat sit on the same book. Turning between them stays horizontal. */
function pageTurn(toWorkspace: boolean): ScreenShift {
  const direction = toWorkspace ? 1 : -1;
  return {
    enter: { opacity: 0, x: direction * 24, y: 0 },
    exit: { opacity: 0, x: direction * -16, y: 0 },
    duration: 0.44,
    ease: PAPER_EASE,
  };
}

/** Stepping into or out of a book. Short travel, long enough that it does not read as a cut. */
function settle(forward: boolean): ScreenShift {
  return {
    enter: { opacity: 0, x: 0, y: forward ? 20 : -16 },
    exit: { opacity: 0, x: 0, y: forward ? -12 : 16 },
    duration: 0.46,
    ease: PAPER_EASE,
  };
}

export function screenShift(
  from: AppScreen,
  to: AppScreen,
  reducedMotion = false,
  coverFlight = false,
): ScreenShift {
  if (reducedMotion) return fade(0.01);
  // Keep the cover as the moving object, and let the page fade in behind it.
  // An instant swap flashes the new layout; sliding the page as well throws the landing box off.
  if (coverFlight) return fade(0.5);
  if (from === to || from === "loading" || to === "loading") return fade(0.32);

  const fromDoor = doorRank(from);
  const toDoor = doorRank(to);
  if (fromDoor !== null && toDoor !== null) return studyDoor(toDoor > fromDoor);

  if (from === "library" && to === "community") return lateral(true, true);
  if (from === "community" && to === "library") return lateral(false, true);
  if (from === "library" && to === "tarot") return lateral(true, false);
  if (from === "tarot" && to === "library") return lateral(false, false);
  if (from === "library" && to === "account") return accountDoor(true);
  if (from === "account" && to === "library") return accountDoor(false);

  if (
    (from === "reader" && to === "workspace") ||
    (from === "workspace" && to === "reader")
  ) {
    return pageTurn(to === "workspace");
  }

  return settle(DEPTH[to] > DEPTH[from]);
}
