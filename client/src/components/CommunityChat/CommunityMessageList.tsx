import { Fragment, useLayoutEffect, useRef } from "react";
import { useCommunityStore } from "@/store/useCommunityStore";
import { CommunityMessageItem } from "./CommunityMessageItem";
import { useCommunityScroll } from "./useCommunityScroll";
import { useCommunityVisibleRead } from "./useCommunityVisibleRead";
export function CommunityMessageList() {
  const state = useCommunityStore();
  const ref = useRef<HTMLDivElement>(null);
  const pending = state.windowAtLatest ? state.pendingMessages : [];
  const ids = state.windowIds.slice(-(100 - pending.length));
  useCommunityVisibleRead(ref, ids.join("|") + ":" + state.jumpVersion);
  const { onScroll, capture } = useCommunityScroll({
    containerRef: ref,
    messageIds: [...ids, ...pending.map((p) => p.clientMessageId)],
    atLiveTail: state.atLiveTail,
    onTailChange: state.setAtLiveTail,
  });
  useLayoutEffect(() => {
    const container = ref.current;
    if (!container || !state.jumpTargetId) return;
    const node = [
      ...container.querySelectorAll<HTMLElement>("[data-community-message]"),
    ].find((n) => n.dataset.communityMessage === state.jumpTargetId);
    if (!node) return;
    container.scrollTop +=
      node.getBoundingClientRect().top -
      container.getBoundingClientRect().top -
      container.clientHeight / 3;
    node.classList.add("community-jump-highlight");
    const timer = setTimeout(
      () => node.classList.remove("community-jump-highlight"),
      2400,
    );
    return () => {
      clearTimeout(timer);
      node.classList.remove("community-jump-highlight");
    };
  }, [state.jumpTargetId, state.jumpVersion]);
  return (
    <div className="community-list-wrap">
      <div
        className="community-message-list"
        ref={ref}
        onScroll={onScroll}
        tabIndex={0}
        aria-label="公共聊天消息"
      >
        {state.hasOlder && (
          <button
            className="community-history"
            disabled={state.historyLoading}
            onClick={() => {
              capture();
              void state.loadOlder();
            }}
          >
            查看更早的聊天
          </button>
        )}
        {!ids.length && !pending.length && (
          <div className="community-empty">
            <span>❧</span>
            <p>先坐一会儿，聊聊最近的阅读。</p>
            <small>你发出的消息会对所有加入的书友公开。</small>
          </div>
        )}
        {ids.map((id, index) => {
          const message = state.messages.find((m) => m.id === id);
          const previous = index
            ? state.messages.find((m) => m.id === ids[index - 1])
            : null;
          const gap =
            previous && message
              ? Date.parse(message.createdAt) - Date.parse(previous.createdAt)
              : Infinity;
          const grouped =
            !!previous &&
            previous.author.memberId === message?.author.memberId &&
            gap >= 0 &&
            gap < 5 * 60_000 &&
            previous.status === "ACTIVE" &&
            message?.status === "ACTIVE";
          const timeBreak =
            !previous ||
            gap > 10 * 60_000 ||
            previous.createdAt.slice(0, 10) !== message?.createdAt.slice(0, 10);
          return message ? (
            <Fragment key={id}>
              {timeBreak && (
                <div className="community-time-divider">
                  <span>
                    {new Date(message.createdAt).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              )}
              <CommunityMessageItem message={message} grouped={grouped} />
            </Fragment>
          ) : null;
        })}
        {pending.map((p) => (
          <article
            key={p.clientMessageId}
            data-community-message={p.clientMessageId}
            className="community-message community-own community-pending"
          >
            <span className="community-avatar">我</span>
            <div className="community-message-body">
              <div className="community-message-meta">
                <strong>我</strong>
                <span>{p.status === "sending" ? "发送中…" : "未确认"}</span>
              </div>
              <div className="community-bubble">
                <p className="community-message-text">{p.content}</p>
              </div>
              {p.status === "failed" && (
                <div className="community-message-actions">
                  <span>{p.error}</span>
                  <button
                    disabled={state.connectionStatus !== "online"}
                    onClick={() => state.retry(p.clientMessageId)}
                  >
                    重试
                  </button>
                  <button onClick={() => state.discard(p.clientMessageId)}>
                    放弃
                  </button>
                </div>
              )}
            </div>
          </article>
        ))}
        {state.hasNewer && (
          <button
            className="community-history"
            disabled={state.historyLoading}
            onClick={() => {
              capture();
              void state.loadNewer();
            }}
          >
            查看后续聊天
          </button>
        )}
      </div>
      <div className="community-jump-tools" aria-label="聊天消息导航">
        {state.mentionUnreadCount > 0 && (
          <button
            className="community-mentions-jump"
            disabled={state.jumpLoading}
            onClick={() => void state.jumpToUnread(true)}
          >
            @ {state.mentionUnreadCount} 条提到你 · 查看 ↑
          </button>
        )}
        {state.lastMentionSeq && state.mentionUnreadCount > 0 && (
          <button
            disabled={state.jumpLoading}
            onClick={() => void state.jumpToUnread(true, true)}
          >
            下一条 @
          </button>
        )}
        {state.unreadCount > 0 && (
          <button
            disabled={state.jumpLoading}
            onClick={() => void state.jumpToUnread(false)}
          >
            跳到未读
          </button>
        )}
        {(!state.atLiveTail ||
          !state.windowAtLatest ||
          state.unseenNewCount > 0) && (
          <button
            className="community-new-messages"
            onClick={() => void state.jumpToLatest()}
          >
            {state.unseenNewCount
              ? `${state.unseenNewCount} 条新消息`
              : "回到最新"}{" "}
            ↓
          </button>
        )}
      </div>
    </div>
  );
}
