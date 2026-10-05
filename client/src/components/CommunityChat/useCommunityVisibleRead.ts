import { useEffect, type RefObject } from "react";
import { useCommunityStore } from "@/store/useCommunityStore";

export function useCommunityVisibleRead(
  ref: RefObject<HTMLDivElement | null>,
  key: string,
) {
  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const confirmed = new Set<string>();
    let animation = 0;
    const measure = () => {
      const bounds = container.getBoundingClientRect();
      const visible = new Set<string>();
      if (document.visibilityState !== "hidden" && bounds.height > 0) {
        for (const node of container.querySelectorAll<HTMLElement>(
          "[data-community-message]",
        )) {
          const box = node.getBoundingClientRect();
          const height = Math.max(
            0,
            Math.min(box.bottom, bounds.bottom) - Math.max(box.top, bounds.top),
          );
          if (
            box.height > 0 &&
            height >= Math.min(box.height, bounds.height) * 0.6
          )
            visible.add(node.dataset.communityMessage!);
        }
      }
      for (const [id, timer] of timers)
        if (!visible.has(id)) {
          clearTimeout(timer);
          timers.delete(id);
        }
      for (const id of confirmed) if (!visible.has(id)) confirmed.delete(id);
      for (const id of visible)
        if (!confirmed.has(id) && !timers.has(id)) {
          timers.set(
            id,
            setTimeout(() => {
              timers.delete(id);
              if (document.visibilityState === "hidden") return;
              confirmed.add(id);
              useCommunityStore.getState().setVisibleMessages([...confirmed]);
            }, 700),
          );
        }
      useCommunityStore.getState().setVisibleMessages([...confirmed]);
    };
    const schedule = () => {
      cancelAnimationFrame(animation);
      animation = requestAnimationFrame(measure);
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") measure();
      else schedule();
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(container);
    for (const node of container.querySelectorAll<HTMLElement>(
      "[data-community-message]",
    ))
      observer.observe(node);
    container.addEventListener("scroll", schedule, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    schedule();
    return () => {
      cancelAnimationFrame(animation);
      observer.disconnect();
      for (const timer of timers.values()) clearTimeout(timer);
      container.removeEventListener("scroll", schedule);
      document.removeEventListener("visibilitychange", visibility);
      useCommunityStore.getState().setVisibleMessages([]);
    };
  }, [ref, key]);
}
