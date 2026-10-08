import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { PAPER_EASE } from "@/lib/ui-motion";
import { useEffect, useState } from "react";
import {
  BACKGROUNDS,
  backgroundUrl,
  useAppearanceStore,
} from "@/store/useAppearanceStore";
import { useUserProfileStore } from "@/store/useUserProfileStore";

export function ScenicBackground() {
  const scope = useAppearanceStore((state) => state.scope);
  const theme = useAppearanceStore((state) => state.theme);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  useEffect(() => {
    // Enable the mist fade only after the first paint, so the homepage does not flash bright.
    const frame = requestAnimationFrame(() => {
      document.documentElement.classList.add("veil-live");
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  // Remount the animation boundary so exiting private images cannot survive a login change.
  return <BackgroundImage key={scope} />;
}

function BackgroundImage() {
  const selection = useAppearanceStore(state => state.selection);
  const profile = useUserProfileStore(state => state.profile);
  const profileError = useUserProfileStore(state => state.error);
  const reducedMotion = useReducedMotion();
  const scene = selection?.kind === "SYSTEM" ? BACKGROUNDS.find(item => item.id === selection.id) : null;
  const media = selection?.kind === "USER" ? profile?.wallpapers.find(item => item.id === selection.id) : null;
  const src = scene?.image ? backgroundUrl(scene.image) : media?.url ?? null;
  const selectedId = selection ? `${selection.kind}:${selection.id}` : null;
  const [visible, setVisible] = useState<{ id: string; src: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => {
    if (!src || !selectedId) return;
    const loader = new Image();
    loader.referrerPolicy = "no-referrer";
    loader.onload = () => { setVisible({ id: selectedId, src }); setFailed(null); };
    loader.onerror = () => setFailed(src);
    loader.src = src;
    return () => { loader.onload = null; loader.onerror = null; loader.src = ""; };
  }, [src, selectedId, retry]);
  const unavailable = Boolean(selection?.kind === "USER" && !src);
  const imageFailed = unavailable || (src && failed === src);
  return (
    <>
      <div className="scenic-background" aria-hidden="true">
        <AnimatePresence initial={false}>
          {src && visible && (
            <motion.img
              key={visible.id}
              src={visible.src}
              alt=""
              referrerPolicy="no-referrer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.68, ease: PAPER_EASE }}
              onError={() => setFailed(visible.src)}
            />
          )}
        </AnimatePresence>
        <div className="scene-veil" />
      </div>
      {(imageFailed || profileError || saveError) && (
        <div role="status" className="background-notice">
          {saveError ?? profileError ?? "背景暂时无法加载。"}
          <button type="button" onClick={() => {
            setRetry((value) => value + 1);
            if (selection?.kind === "USER" || profileError) void useUserProfileStore.getState().loadProfile();
          }}>
            重试
          </button>
          <button
            type="button"
            onClick={() => {
              setSaveError(null);
              if (useUserProfileStore.getState().userId) void useUserProfileStore.getState().updateProfile({ wallpaper: { mode: "FIXED", kind: "SYSTEM", id: "none" } }).catch(error => {
                if (!(error instanceof DOMException && error.name === "AbortError")) setSaveError(error instanceof Error ? error.message : "背景保存失败");
              });
              else useAppearanceStore.getState().setBackground("none");
            }}
          >
            使用纯色
          </button>
        </div>
      )}
    </>
  );
}
