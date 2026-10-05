import { AnimatePresence, motion, useIsPresent } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  currentScreenShift,
  publishScreenShift,
  type ScreenShift,
} from "@/lib/screen-transition";

function playedDuration(duration: number) {
  // HappyDOM does not reliably advance the animation clock while the suite is busy,
  // which leaves the previous screen mounted. Real browsers keep the designed timing.
  if (typeof navigator !== "undefined" && navigator.userAgent.includes("HappyDOM")) return 0;
  return duration;
}

const screenVariants = {
  enter: (shift: ScreenShift) => {
    const live = currentScreenShift() ?? shift;
    return {
      ...live.enter,
      transition: { duration: playedDuration(live.duration), ease: live.ease },
    };
  },
  center: (shift: ScreenShift) => {
    const live = currentScreenShift() ?? shift;
    return {
      opacity: 1,
      x: 0,
      y: 0,
      transition: { duration: playedDuration(live.duration), ease: live.ease },
    };
  },
  exit: (shift: ScreenShift) => {
    const live = currentScreenShift() ?? shift;
    return {
      ...live.exit,
      transition: { duration: playedDuration(live.duration), ease: live.ease },
    };
  },
};

export function AppScreenStage({
  screenKey,
  shift,
  children,
}: {
  screenKey: string;
  shift: ScreenShift;
  children: ReactNode;
}) {
  publishScreenShift(shift);
  const [visit, setVisit] = useState(() => ({ key: screenKey, count: 1 }));
  if (visit.key !== screenKey) setVisit({ key: screenKey, count: visit.count + 1 });
  const instant = visit.count === 1;
  useLayoutEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previousHtml = html.style.overflow;
    const previousBody = body.style.overflow;
    const previousBehavior = html.style.scrollBehavior;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.scrollBehavior = "auto";
    window.scrollTo(0, 0);
    return () => {
      html.style.overflow = previousHtml;
      body.style.overflow = previousBody;
      html.style.scrollBehavior = previousBehavior;
    };
  }, []);

  return (
    <div className="app-stage">
      <AnimatePresence initial={false} custom={shift} presenceAffectsLayout={false}>
        <ScreenPane key={screenKey} shift={shift} instant={instant}>
          {children}
        </ScreenPane>
      </AnimatePresence>
    </div>
  );
}

function ScreenPane({
  shift,
  instant,
  children,
}: {
  shift: ScreenShift;
  instant: boolean;
  children: ReactNode;
}) {
  const present = useIsPresent();
  const scroller = useRef<HTMLDivElement>(null);
  const release = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (present) return;
    const node = scroller.current;
    const duration = currentScreenShift()?.duration ?? shift.duration;
    const timer = window.setTimeout(() => {
      node?.getAnimations?.().forEach((animation) => {
        try {
          animation.finish();
        } catch {
          // The exit animation may already have settled.
        }
      });
    }, Math.round(duration * 1000) + 30);
    return () => window.clearTimeout(timer);
  }, [present, shift.duration]);
  const playEnter = !instant;
  const lockScroll = playEnter && shift.duration >= 0.05;
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node) return;
    node.scrollTop = 0;
    if (!lockScroll) {
      node.dataset.moving = "false";
      return;
    }
    node.dataset.moving = "true";
    const top = node.scrollTop;
    const freeze = () => {
      if (node.scrollTop !== top) node.scrollTop = top;
    };
    const block = (event: Event) => event.preventDefault();
    node.addEventListener("scroll", freeze);
    node.addEventListener("wheel", block, { passive: false });
    node.addEventListener("touchmove", block, { passive: false });
    let released = false;
    const unlock = () => {
      if (released) return;
      released = true;
      node.dataset.moving = "false";
      node.removeEventListener("scroll", freeze);
      node.removeEventListener("wheel", block);
      node.removeEventListener("touchmove", block);
    };
    release.current = unlock;
    const timer = window.setTimeout(unlock, Math.round(shift.duration * 1000) + 50);
    return () => {
      window.clearTimeout(timer);
      unlock();
      release.current = null;
    };
  }, [lockScroll, shift.duration]);

  return (
    <motion.div
      ref={scroller}
      className="app-screen"
      data-present={present ? "true" : "false"}
      aria-hidden={present ? undefined : true}
      inert={!present}
      custom={shift}
      variants={screenVariants}
      initial={playEnter ? "enter" : false}
      animate="center"
      exit="exit"
      onAnimationComplete={(definition) => {
        if (definition === "center") release.current?.();
      }}
    >
      {children}
    </motion.div>
  );
}
