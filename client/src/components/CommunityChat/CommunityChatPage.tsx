import { useEffect, useState } from "react";
import { ArrowLeft, Users, Coffee } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { ScenicBackground } from "@/components/ScenicBackground";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useAuthStore } from "@/store/useAuthStore";
import { useCommunityStore } from "@/store/useCommunityStore";
import { CommunityComposer } from "./CommunityComposer";
import { CommunityMessageList } from "./CommunityMessageList";
import "./community-chat.css";

export function CommunityChatPage({ onBack }: { onBack: () => void }) {
  const state = useCommunityStore();
  const name = useAuthStore((s) => s.user?.name);
  const [joining, setJoining] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    useCommunityStore.getState().enterPage();
    return () => useCommunityStore.getState().leavePage();
  }, []);
  const status = {
    idle: "尚未连接",
    connecting: "正在连接",
    syncing: "正在同步",
    online: "聊天已连接",
    offline: "连接已断开",
  }[state.connectionStatus];
  return (
    <div className="community-page">
      <ScenicBackground />
      <AppHeader caption="书友客厅" />
      <main className="community-main">
        <div className="community-heading">
          <div>
            <button className="community-back" onClick={onBack}>
              <ArrowLeft size={13} />
              返回书库
            </button>
            <h1>
              书友客厅<span>❧</span>
            </h1>
            <p>书页之外，也有故事。</p>
          </div>
          <div className="community-room-label">
            <Users size={14} />
            <span>公共聊天室</span>
          </div>
        </div>
        <div className="community-layout">
          <section className="community-paper" aria-label="书友公共聊天">
            <div className="community-room-top">
              <span>
                <i
                  className={
                    state.connectionStatus === "online"
                      ? "community-online"
                      : ""
                  }
                />
                {status}
              </span>
              {state.membership && (
                <small>{state.onlineCount} 位书友在座</small>
              )}
            </div>
            {state.error && (
              <div className="community-error" role="alert">
                <span>{state.error}</span>
                {state.connectionStatus === "offline" && (
                  <button onClick={() => void state.connect()}>重新连接</button>
                )}
              </div>
            )}
            {!state.membership ? (
              <div className="community-welcome">
                <Coffee size={32} strokeWidth={1} />
                <h2>给自己留一个座位。</h2>
                <p>
                  这是全站书友共用的客厅。
                  <br />
                  聊阅读、聊人物，也聊今天的心情。
                </p>
                <button
                  className="community-primary"
                  disabled={!state.membershipChecked || busy}
                  onClick={() => setJoining(true)}
                >
                  {state.membershipChecked
                    ? "加入书友客厅"
                    : "正在查看入场状态…"}
                </button>
                <small>私人书库和助手对话不会带入这里。</small>
              </div>
            ) : (
              <>
                {state.membership.consentVersion !== "2026-10-05" && (
                  <div className="community-consent-note">
                    <span>聊天室可展示你的账号头像。确认公开说明后启用。</span>
                    <button onClick={() => setJoining(true)}>查看说明</button>
                  </div>
                )}
                <CommunityMessageList />
                <CommunityComposer />
              </>
            )}
          </section>
        </div>
      </main>
      <ConfirmDialog
        open={joining}
        title="在书友客厅坐坐？"
        description={`你将以「${name ?? "书友"}」发言。当前头像、昵称及消息将对所有加入的书友公开，更新账号头像后会同步。私人书籍、助手对话和记忆保持隔离；公共群聊不保证防剧透。请勿发送敏感资料。`}
        confirmLabel={busy ? "正在加入…" : "同意并加入"}
        onCancel={() => {
          if (!busy) setJoining(false);
        }}
        onConfirm={() => {
          if (busy) return;
          setBusy(true);
          void state.join().finally(() => {
            setBusy(false);
            setJoining(false);
          });
        }}
      />
    </div>
  );
}
