import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Send, X, Smile, AtSign } from "lucide-react";
import { useCommunityStore } from "@/store/useCommunityStore";
import { searchCommunityMembers } from "@/lib/community-api";
import type { CommunityPublicMember } from "@/lib/community-types";
export function CommunityComposer() {
  const state = useCommunityStore();
  const composing = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const node = input.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.min(120, Math.max(28, node.scrollHeight))}px`;
  }, [state.draft]);
  const [now, setNow] = useState(() => Date.now());
  const [caret, setCaret] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(true);
  const [members, setMembers] = useState<CommunityPublicMember[]>([]);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [resultQuery, setResultQuery] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState(0);
  const prefix = state.draft.slice(0, caret);
  const query = pickerOpen
    ? prefix.match(/(?:^|\s)@([^\s@]{0,50})$/)?.[1]
    : undefined;
  const candidatesReady =
    query !== undefined && resultQuery === query && !loadingMembers;
  useEffect(() => {
    if (query === undefined || !state.membership) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      setLoadingMembers(true);
      setMemberError(null);
      setSelected(0);
      void searchCommunityMembers(query, abort.signal)
        .then((result) => {
          if (!abort.signal.aborted) {
            setMembers(result);
            setResultQuery(query);
          }
        })
        .catch(() => {
          if (!abort.signal.aborted) {
            setMembers([]);
            setResultQuery(query);
            setMemberError("成员列表加载失败，请重新输入 @");
          }
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoadingMembers(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query, state.membership]);
  const choose = (member: CommunityPublicMember) => {
    if (!candidatesReady) return;
    state.addMention(member);
    const start = prefix.lastIndexOf("@");
    state.setDraft(state.draft.slice(0, start) + state.draft.slice(caret));
    setPickerOpen(false);
    setCaret(start);
    input.current?.focus();
    requestAnimationFrame(() => input.current?.setSelectionRange(start, start));
  };
  useEffect(() => {
    if (!state.membership?.mutedUntil) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state.membership?.mutedUntil]);
  const length = Array.from(state.draft.trim()).length;
  const muted =
    !!state.membership?.mutedUntil &&
    Date.parse(state.membership.mutedUntil) > now;
  const disabled =
    state.connectionStatus !== "online" ||
    muted ||
    length === 0 ||
    length > 2000 ||
    state.pendingMessages.length >= 20;
  return (
    <form
      className="community-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) state.send();
      }}
    >
      {state.replyTarget && (
        <div className="community-reply-draft">
          <span>
            回复 {state.replyTarget.author.name}：
            {state.replyTarget.content?.slice(0, 80)}
          </span>
          <button
            type="button"
            aria-label="取消引用"
            onClick={() => state.setReply(null)}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <label className="sr-only" htmlFor="community-draft">
        聊天消息
      </label>
      <div className="community-input-shell">
        {!!state.draftMentions.length && (
          <div className="community-draft-mentions">
            {state.draftMentions.map((member) => (
              <span className="community-mention" key={member.memberId}>
                @{member.name}
                <button
                  type="button"
                  aria-label={`取消 @${member.name}`}
                  onClick={() => state.removeMention(member.memberId)}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={input}
          id="community-draft"
          rows={1}
          placeholder={
            muted ? "暂时被禁言，请稍后再聊" : "把读完的心情放在这里…"
          }
          value={state.draft}
          onChange={(e) => {
            state.setDraft(e.target.value);
            setCaret(e.target.selectionStart);
            setPickerOpen(true);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          aria-controls={
            query !== undefined ? "community-mention-picker" : undefined
          }
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            composing.current = false;
          }}
          onKeyDown={(event) => {
            if (
              query !== undefined &&
              !event.nativeEvent.isComposing &&
              !composing.current
            ) {
              if (event.key === "Escape") {
                event.preventDefault();
                setPickerOpen(false);
                return;
              }
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setSelected((n) =>
                  Math.max(
                    0,
                    Math.min(
                      members.length - 1,
                      n + (event.key === "ArrowDown" ? 1 : -1),
                    ),
                  ),
                );
                return;
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (candidatesReady && members[selected])
                  choose(members[selected]);
                return;
              }
            }
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              !composing.current
            ) {
              event.preventDefault();
              if (!disabled) state.send();
            }
          }}
        />
      </div>
      {query !== undefined && (
        <div
          id="community-mention-picker"
          className="community-mention-picker"
          aria-label="选择要提及的书友"
        >
          <small>选择书友 · ↑↓ 切换，Enter 确认</small>
          {!candidatesReady ? (
            <p>正在寻找书友…</p>
          ) : memberError ? (
            <p role="alert">{memberError}</p>
          ) : members.length ? (
            members.map((member, index) => (
              <button
                type="button"
                key={member.memberId}
                className={index === selected ? "is-selected" : ""}
                onClick={() => choose(member)}
              >
                <span className="community-picker-initial">
                  {Array.from(member.name)[0]}
                </span>
                <span>{member.name}</span>
                <small>{member.memberId.slice(-4)}</small>
              </button>
            ))
          ) : (
            <p>没有找到这位书友</p>
          )}
        </div>
      )}
      <div className="community-composer-tools">
        <div className="community-emojis">
          <button
            type="button"
            aria-label="提及书友"
            onClick={() => {
              const pos = input.current?.selectionStart ?? state.draft.length;
              const addition =
                pos > 0 && !/\s/.test(state.draft[pos - 1]) ? " @" : "@";
              state.setDraft(
                state.draft.slice(0, pos) + addition + state.draft.slice(pos),
              );
              setCaret(pos + addition.length);
              setPickerOpen(true);
              input.current?.focus();
              requestAnimationFrame(() =>
                input.current?.setSelectionRange(
                  pos + addition.length,
                  pos + addition.length,
                ),
              );
            }}
          >
            <AtSign size={17} />
          </button>
          <Smile size={15} />
          {["🍵", "📖", "🌿", "✨"].map((emoji) => (
            <button
              type="button"
              key={emoji}
              aria-label={`插入 ${emoji}`}
              onClick={() => {
                state.setDraft(state.draft + emoji);
                input.current?.focus();
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
        <span className={length > 2000 ? "community-limit" : ""}>
          {length}/2000
        </span>
        <button type="submit" className="community-send" disabled={disabled}>
          <span>发送</span>
          <Send size={14} />
        </button>
      </div>
      <p className="community-compose-note">
        {muted
          ? `禁言至 ${new Date(state.membership!.mutedUntil!).toLocaleTimeString()}`
          : state.connectionStatus !== "online"
            ? "连接恢复后可发送，草稿会保留。"
            : "Enter 发送，Shift + Enter 换行。这里是公共聊天。"}
      </p>
    </form>
  );
}
