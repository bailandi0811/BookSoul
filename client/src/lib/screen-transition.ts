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

let publishedShift: ScreenShift | null = null;

/** The leaving screen is frozen with its old props, so the live transition is read at animation time. */
export function publishScreenShift(shift: ScreenShift) {
  publishedShift = shift;
}

export function currentScreenShift() {
  return publishedShift;
}

/** Landing and the library share a vertical step: the invitation rises, the shelf settles in. */
function studyDoor(intoStudy: boolean): ScreenShift {
  return {
    enter: { opacity: 0, x: 0, y: intoStudy ? 36 : -28 },
    exit: { opacity: 0, x: 0, y: intoStudy ? -24 : 28 },
    duration: 0.5,
    ease: PAPER_EASE,
  };
}

/** The lounge sits beside the shelf. Entering moves right-to-left; leaving reverses it. */
function loungeDoor(intoLounge: boolean): ScreenShift {
  return {
    enter: { opacity: 0, x: intoLounge ? 64 : -48, y: 0 },
    exit: { opacity: 0, x: intoLounge ? -40 : 56, y: 0 },
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
  if (coverFlight) {
    return {
      enter: { opacity: 0, x: 0, y: 0 },
      exit: { opacity: 0, x: 0, y: 0 },
      duration: 0.48,
      ease: PAPER_EASE,
    };
  }
  if (from === "landing" && to === "library") return studyDoor(true);
  if (from === "library" && to === "landing") return studyDoor(false);
  if (from === "library" && to === "community") return loungeDoor(true);
  if (from === "community" && to === "library") return loungeDoor(false);
  return fade(0.18);
}
