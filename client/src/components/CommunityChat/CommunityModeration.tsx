import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { useCommunityStore } from "@/store/useCommunityStore";
import { muteCommunityMember } from "@/lib/community-api";
import type { CommunityMessage } from "@/lib/community-types";
export function CommunityModeration({
  message,
}: {
  message: CommunityMessage;
}) {
  const moderator = useCommunityStore((s) => s.membership?.isModerator);
  const own = useCommunityStore(
    (s) => s.membership?.memberId === message.author.memberId,
  );
  const [action, setAction] = useState<"hide" | "mute" | null>(null);
  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState<10 | 60>(10);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!moderator) return null;
  const open = (value: "hide" | "mute") => {
    setAction(value);
    setReason("");
    setKey(crypto.randomUUID());
    setError(null);
  };
  const apply = async () => {
    if (busy || !reason.trim() || Array.from(reason.trim()).length > 200)
      return;
    setBusy(true);
    setError(null);
    try {
      if (action === "hide")
        await useCommunityStore.getState().hide(message.id, reason);
      else
        await muteCommunityMember(message.author.memberId, {
          clientActionId: key,
          minutes,
          reason,
        });
      setAction(null);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "管理操作失败，请重试",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" onClick={() => open("hide")}>
        隐藏
      </button>
      {!own && (
        <button type="button" onClick={() => open("mute")}>
          禁言
        </button>
      )}
      <Dialog
        open={action !== null}
        title={action === "hide" ? "隐藏公共消息" : "暂时禁言书友"}
        onClose={() => {
          if (!busy) setAction(null);
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void apply();
          }}
        >
          <p className="dialog-intro">
            {action === "hide"
              ? "正文和引用摘录会被移除。"
              : `将限制「${message.author.name}」在公共聊天室的新发言。`}
          </p>
          <label className="block text-sm">
            原因（1–200 字）
            <textarea
              className="mt-2 w-full rounded border border-border p-2"
              value={reason}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {action === "mute" && (
            <label className="block text-sm">
              时长
              <select
                className="ml-3 rounded border border-border p-2"
                value={minutes}
                disabled={busy}
                onChange={(e) => setMinutes(Number(e.target.value) as 10 | 60)}
              >
                <option value={10}>10 分钟</option>
                <option value={60}>60 分钟</option>
              </select>
            </label>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              className="dialog-secondary"
              disabled={busy}
              onClick={() => setAction(null)}
            >
              取消
            </button>
            <button
              type="submit"
              className="dialog-primary"
              disabled={
                busy || !reason.trim() || Array.from(reason.trim()).length > 200
              }
            >
              {busy ? "正在处理…" : action === "hide" ? "确认隐藏" : "确认禁言"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
