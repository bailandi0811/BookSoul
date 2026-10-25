import { useVirtualizer } from "@tanstack/react-virtual";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { MessageBubble } from "./MessageBubble";
import type { Message } from "@/store/useChatStore";

const MESSAGE_GAP_PX = 36;
const ESTIMATED_MESSAGE_HEIGHT = 160;
const TOP_LOAD_THRESHOLD_PX = 200;
export const CHAT_SCROLL_END_THRESHOLD = 80;

export type VirtualChatViewportHandle = {
  scrollToLatest: () => void;
};

type VirtualChatViewportProps = {
  messages: Message[];
  viewportRef: React.RefObject<HTMLDivElement | null>;
  followingLatestRef: React.MutableRefObject<boolean>;
  onShowLatestChange: (show: boolean) => void;
  onNearTop: () => void;
  hasOlderMessages: boolean;
  isOlderMessagesLoading: boolean;
  olderMessagesError: string | null;
  onRetryOlderMessages: () => void;
  selectedSourceMessageId: string | null;
  isSourcesOpen: boolean;
  onOpenReferences: (messageId: string) => void;
  animateEntryIds: ReadonlySet<string>;
};

export const VirtualChatViewport = forwardRef<
  VirtualChatViewportHandle,
  VirtualChatViewportProps
>(function VirtualChatViewport(
  {
    messages,
    viewportRef,
    followingLatestRef,
    onShowLatestChange,
    onNearTop,
    hasOlderMessages,
    isOlderMessagesLoading,
    olderMessagesError,
    onRetryOlderMessages,
    selectedSourceMessageId,
    isSourcesOpen,
    onOpenReferences,
    animateEntryIds,
  },
  ref,
) {
  const nearTopTriggeredRef = useRef(false);
  const hasInitialScrolledRef = useRef(false);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => ESTIMATED_MESSAGE_HEIGHT,
    overscan: 6,
    gap: MESSAGE_GAP_PX,
    getItemKey: (index) => messages[index]?.id ?? index,
    anchorTo: "end",
    followOnAppend: true,
    scrollEndThreshold: CHAT_SCROLL_END_THRESHOLD,
    measureElement: (element) => element.getBoundingClientRect().height,
  });

  useImperativeHandle(
    ref,
    () => ({
      scrollToLatest: () => {
        if (messages.length === 0) return;
        followingLatestRef.current = true;
        onShowLatestChange(false);
        virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
      },
    }),
    [
      followingLatestRef,
      messages.length,
      onShowLatestChange,
      virtualizer,
    ],
  );

  useEffect(() => {
    if (messages.length === 0 || hasInitialScrolledRef.current) return;
    hasInitialScrolledRef.current = true;
    followingLatestRef.current = true;
    virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
  }, [followingLatestRef, messages.length, virtualizer]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onScroll = () => {
      const nearBottom =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <
        CHAT_SCROLL_END_THRESHOLD;
      followingLatestRef.current = nearBottom;
      onShowLatestChange(!nearBottom);

      const nearTop = viewport.scrollTop < TOP_LOAD_THRESHOLD_PX;
      if (nearTop && hasOlderMessages && !isOlderMessagesLoading) {
        if (!nearTopTriggeredRef.current) {
          nearTopTriggeredRef.current = true;
          onNearTop();
        }
      } else if (!nearTop) {
        nearTopTriggeredRef.current = false;
      }
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", onScroll);
  }, [
    followingLatestRef,
    hasOlderMessages,
    isOlderMessagesLoading,
    onNearTop,
    onShowLatestChange,
    viewportRef,
  ]);

  return (
    <div className="mx-auto w-full max-w-[58rem] px-4 pb-4 sm:px-6 lg:px-8">
      {(isOlderMessagesLoading || olderMessagesError) && (
        <div className="flex justify-center py-3" role="status">
          {olderMessagesError ? (
            <button
              type="button"
              className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={onRetryOlderMessages}
            >
              较早消息加载失败，点击重试
            </button>
          ) : (
            <span className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
              正在加载更早消息…
            </span>
          )}
        </div>
      )}
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const message = messages[virtualRow.index];
          if (!message?.id) return null;
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <MessageBubble
                message={message}
                referencesActive={
                  isSourcesOpen && selectedSourceMessageId === message.id
                }
                onOpenReferences={onOpenReferences}
                animateEntry={animateEntryIds.has(message.id)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});
