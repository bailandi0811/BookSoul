import { ChevronDown, Image, BookOpen, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  BACKGROUNDS,
  useAppearanceStore,
} from "@/store/useAppearanceStore";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  PAPER_EASE,
  PANEL_DURATION,
  PANEL_EXIT_DURATION,
} from "@/lib/ui-motion";
import { ThemeToggle } from "./ThemeToggle";
import { AccountSection } from "./auth/AccountSection";
import { WallpaperLibrary } from "./WallpaperLibrary";
import { CommunityChatEntry } from "./CommunityChat/CommunityChatEntry";

import { TarotEntry } from "./Tarot/TarotEntry";
export function AppHeader({
  account = true,
  action,
  caption = "AI 藏书室",
  appearanceRequest = 0,
}: {
  account?: boolean;
  action?: ReactNode;
  caption?: string;
  appearanceRequest?: number;
}) {
  const background = useAppearanceStore((state) => state.background);
  const theme = useAppearanceStore((state) => state.theme);
  const setTheme = useAppearanceStore((state) => state.setTheme);
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [lastAppearanceRequest, setLastAppearanceRequest] =
    useState(appearanceRequest);
  if (appearanceRequest !== lastAppearanceRequest) {
    setLastAppearanceRequest(appearanceRequest);
    if (appearanceRequest > 0) {
      setVisible(true);
      setOpen(true);
    }
  }
  const reducedMotion = useReducedMotion();
  const show = () => {
    setVisible(true);
    setOpen(true);
  };
  const close = () => setOpen(false);
  const chooser = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (appearanceRequest > 0 && chooser.current) {
      chooser.current.querySelector("summary")?.focus({ preventScroll: true });
    }
  }, [appearanceRequest]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !chooser.current?.contains(event.target)
      )
        setOpen(false);
    };
    window.addEventListener("pointerdown", outside);
    return () => window.removeEventListener("pointerdown", outside);
  }, []);
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div className="brand-capsule">
          <BookOpen size={25} strokeWidth={1.25} />
          <span className="brand-name">BookSoul</span>
          <span className="brand-caption">{caption}</span>
        </div>
        <div className="app-header-actions">
          {account && <span className="hidden sm:contents"><CommunityChatEntry /><TarotEntry /></span>}
          <div className="appearance-capsule">
            <details
              className="background-chooser"
              ref={chooser}
              open={visible}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setOpen(false);
                  chooser.current
                    ?.querySelector("summary")
                    ?.focus({ preventScroll: true });
                  event.stopPropagation();
                }
              }}
            >
              <summary
                aria-label="选择背景"
                aria-expanded={open}
                onClickCapture={(event) => {
                  event.preventDefault();
                  if (open) close();
                  else show();
                }}
              >
                <Image size={15} />
                <span>背景</span>
                <motion.span
                  className="background-chevron"
                  animate={{ rotate: open ? 180 : 0 }}
                  transition={{
                    duration: reducedMotion ? 0 : PANEL_DURATION,
                    ease: PAPER_EASE,
                  }}
                >
                  <ChevronDown size={12} />
                </motion.span>
              </summary>
              <AnimatePresence
                onExitComplete={() => {
                  if (!open) setVisible(false);
                }}
              >
                {open && (
                  <motion.div
                    className="background-menu"
                    initial={
                      reducedMotion ? false : { opacity: 0, y: -6, scale: 0.98 }
                    }
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{
                      opacity: 0,
                      y: reducedMotion ? 0 : -4,
                      scale: reducedMotion ? 1 : 0.99,
                    }}
                    transition={{
                      duration: reducedMotion ? 0 : PANEL_EXIT_DURATION,
                      ease: PAPER_EASE,
                    }}
                  >
                    <div className="background-menu-heading">
                      <h2 className="background-menu-title">给书房换个景色</h2>
                      <button
                        type="button"
                        aria-label="关闭背景菜单"
                        onClick={() => {
                          close();
                          chooser.current
                            ?.querySelector("summary")
                            ?.focus({ preventScroll: true });
                        }}
                      >
                        <X size={15} />
                      </button>
                    </div>
                    <div className="theme-segment" aria-label="书房主题">
                      {(
                        [
                          ["light", "亮色"],
                          ["dark", "暗色"],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={theme === value}
                          onClick={() => setTheme(value)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <WallpaperLibrary onSelected={() => {
                      close();
                      chooser.current?.querySelector("summary")?.focus({ preventScroll: true });
                    }} />
                    {BACKGROUNDS.find((scene) => scene.id === background)
                      ?.credit && (
                      <a
                        href={
                          BACKGROUNDS.find((scene) => scene.id === background)!
                            .credit!
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        当前图片来源
                      </a>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </details>
            <ThemeToggle />
          </div>
          {account ? <AccountSection /> : action}
        </div>
      </div>
      {account && <nav aria-label="书房活动" className="community-mobile-entry flex justify-end gap-2 px-3 pb-2 sm:hidden"><CommunityChatEntry mobile /><TarotEntry /></nav>}
    </header>
  );
}
