import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
export function useCommunityScroll({
  containerRef,
  messageIds,
  atLiveTail,
  onTailChange,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  messageIds: string[];
  atLiveTail: boolean;
  onTailChange: (value: boolean) => void;
}) {
  const anchor = useRef<{ id: string; top: number } | null>(null);
  const previous = useRef("");
  const capture = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const top = container.getBoundingClientRect().top;
    const node = [
      ...container.querySelectorAll<HTMLElement>("[data-community-message]"),
    ].find((el) => el.getBoundingClientRect().bottom > top);
    anchor.current = node
      ? {
          id: node.dataset.communityMessage!,
          top: node.getBoundingClientRect().top - top,
        }
      : null;
  }, [containerRef]);
  const key = messageIds.join("|");
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      if (atLiveTail) container.scrollTop = container.scrollHeight;
      capture();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, atLiveTail, capture]);
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (previous.current !== key) {
      if (atLiveTail) container.scrollTop = container.scrollHeight;
      else if (anchor.current) {
        const id = anchor.current.id;
        const node = [
          ...container.querySelectorAll<HTMLElement>(
            "[data-community-message]",
          ),
        ].find((el) => el.dataset.communityMessage === id);
        if (node)
          container.scrollTop +=
            node.getBoundingClientRect().top -
            container.getBoundingClientRect().top -
            anchor.current.top;
      }
      previous.current = key;
    }
    capture();
  }, [key, atLiveTail, containerRef, capture]);
  const onScroll = () => {
    const c = containerRef.current;
    if (!c) return;
    capture();
    onTailChange(c.scrollHeight - c.clientHeight - c.scrollTop <= 80);
  };
  return { onScroll, capture };
}
