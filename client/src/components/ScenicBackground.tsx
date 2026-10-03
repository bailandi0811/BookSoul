import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  BACKGROUNDS,
  backgroundUrl,
  useAppearanceStore,
} from "@/store/useAppearanceStore";

export function ScenicBackground() {
  const background = useAppearanceStore((state) => state.background);
  const theme = useAppearanceStore((state) => state.theme);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const scene = BACKGROUNDS.find((item) => item.id === background)!;
  const [visibleImage, setVisibleImage] = useState<string | null>(scene.image);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!scene.image) return;
    const selected = scene.image;
    const loader = new Image();
    // Keep the previous view until the next image is ready to crossfade.
    loader.onload = () => {
      setVisibleImage(selected);
      setFailedImage(null);
    };
    loader.onerror = () => setFailedImage(selected);
    loader.src = backgroundUrl(selected);
    return () => {
      loader.onload = null;
      loader.onerror = null;
    };
  }, [scene.image, retry]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  return (
    <>
      <div className="scenic-background" aria-hidden="true">
        <AnimatePresence initial={false}>
          {scene.image && visibleImage && (
            <motion.img
              key={visibleImage}
              src={backgroundUrl(visibleImage)}
              alt=""
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45 }}
              onError={() => setFailedImage(visibleImage)}
            />
          )}
        </AnimatePresence>
        <div className="scene-veil" />
      </div>
      {scene.image && failedImage === scene.image && (
        <div role="status" className="background-notice">
          背景暂时无法加载。
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            重试
          </button>
          <button
            type="button"
            onClick={() => useAppearanceStore.getState().setBackground("none")}
          >
            使用纯色
          </button>
        </div>
      )}
    </>
  );
}
