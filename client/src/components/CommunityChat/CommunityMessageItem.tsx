import { useState } from "react";
import { CornerUpLeft, Trash2 } from "lucide-react";
import { useCommunityStore } from "@/store/useCommunityStore";
import type { CommunityMessage } from "@/lib/community-types";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CommunityModeration } from "./CommunityModeration";
import { CommunityAvatar } from "./CommunityAvatar";
export function CommunityMessageItem({
  message,
  grouped = false,
}: {
  message: CommunityMessage;
  grouped?: boolean;
}) {
  const own = useCommunityStore(
    (s) => s.membership?.memberId === message.author.memberId,
  );
  const setReply = useCommunityStore((s) => s.setReply);
  const remove = useCommunityStore((s) => s.remove);
  const memberId = useCommunityStore((s) => s.membership?.memberId);
  const jump = useCommunityStore((s) => s.jumpToMessage);
  const mentioned =
    !own &&
    message.status === "ACTIVE" &&
    message.mentions?.some((m) => m.memberId === memberId);
  const [confirm, setConfirm] = useState(false);
  return (
    <article
      data-community-message={message.id}
      className={`community-message${own ? " community-own" : ""}${grouped ? " community-grouped" : ""}${mentioned ? " community-mentioned" : ""}`}
    >
      {grouped ? (
        <span className="community-avatar-space" />
      ) : (
        <CommunityAvatar
          memberId={message.author.memberId}
          name={message.author.name}
        />
      )}
      <div className="community-message-body">
        {!grouped && (
          <div className="community-message-meta">
            <strong>{message.author.name}</strong>
            {own && <span>我</span>}
            <time dateTime={message.createdAt}>
              {new Date(message.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          </div>
        )}
        <div className="community-bubble">
          {message.replyTo && (
            <button
              type="button"
              className="community-quote"
              onClick={() => void jump(message.replyTo!.id)}
              aria-label={`查看引用 ${message.replyTo.name} 的消息`}
            >
              <span>引用 {message.replyTo.name}</span>
              <p>
                {message.replyTo.status === "REMOVED"
                  ? "引用的消息已移除"
                  : message.replyTo.excerpt}
              </p>
            </button>
          )}
          {message.status === "ACTIVE" && !!message.mentions?.length && (
            <div className="community-message-mentions">
              {message.mentions.map((m) => (
                <span
                  key={m.memberId}
                  className={`community-mention${m.memberId === memberId ? " community-mention-me" : ""}`}
                >
                  @{m.name}
                </span>
              ))}
            </div>
          )}
          <p
            className={`community-message-text${message.status === "REMOVED" ? " community-tombstone" : ""}`}
          >
            {message.status === "REMOVED" ? "这条消息已移除" : message.content}
          </p>
        </div>
        {mentioned && (
          <small className="community-mentioned-label">提到了你</small>
        )}
        {message.status === "ACTIVE" && (
          <div className="community-message-actions">
            <button
              type="button"
              onClick={() => {
                setReply(message);
                document.getElementById("community-draft")?.focus();
              }}
            >
              <CornerUpLeft size={12} />
              回复
            </button>
            {own && (
              <button type="button" onClick={() => setConfirm(true)}>
                <Trash2 size={12} />
                撤回
              </button>
            )}
            <CommunityModeration message={message} />
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        title="撤回这条消息？"
        description="正文和引用摘录会从公共聊天中移除。"
        confirmLabel="撤回"
        tone="danger"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          void remove(message.id);
        }}
      />
    </article>
  );
}
