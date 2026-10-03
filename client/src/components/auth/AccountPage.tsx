import { useState } from "react";
import {
  ArrowLeft,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Dialog } from "@/components/ui/Dialog";
import { claimCurrentGuest, logoutCurrentDevice } from "@/lib/auth-api";
import { useAuthStore } from "@/store/useAuthStore";
import { useChatStore } from "@/store/useChatStore";
import { EmailVerificationForm } from "./EmailVerificationForm";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export function AccountPage({ onBack }: { onBack: () => void }) {
  const user = useAuthStore((state) => state.user);
  const claimState = useAuthStore((state) => state.claimState);
  const claimMessage = useAuthStore((state) => state.claimMessage);
  const sessionId = useChatStore((state) => state.sessionId);
  const [dialog, setDialog] = useState<"verify" | "forgot" | null>(null);
  const [appearanceRequest, setAppearanceRequest] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  if (!user) return null;

  async function logout() {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await logoutCurrentDevice();
    } catch {
      setLogoutError("退出失败，请检查网络后重试");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <main className="account-page min-h-[100dvh] text-foreground">
      <AppHeader caption="账号设置" appearanceRequest={appearanceRequest} />
      <div className="account-layout">
        <button type="button" className="account-return" onClick={onBack}>
          <ArrowLeft size={16} />
          返回书库
        </button>
        <h1 className="font-display">你的账号</h1>
        <p className="account-lead">管理账号、安全与书房外观。</p>
        <div className="account-grid">
          <section
            className="account-card"
            aria-labelledby="account-profile-title"
          >
            <h2 id="account-profile-title" className="font-display">
              个人信息
            </h2>
            <div className="account-profile">
              <span className="account-profile-avatar" aria-hidden="true">
                {Array.from(user.name)[0] || <UserRound size={22} />}
              </span>
              <div>
                <strong className="font-display">{user.name}</strong>
                <p>你的私人阅读空间</p>
              </div>
            </div>
            <div className="account-detail">
              <p className="account-detail-label">邮箱</p>
              <div className="account-email-row">
                <span className="account-email">{user.email}</span>
                <span className="account-status">
                  {user.emailVerifiedAt ? "已验证" : "未验证"}
                </span>
              </div>
              <button
                type="button"
                className="account-text-button"
                onClick={() => setDialog("verify")}
              >
                {user.emailVerifiedAt ? "查看邮箱验证" : "补验证"}
              </button>
            </div>
            <p className="account-note">邮箱与验证状态集中保存在账号页。</p>
            {sessionId &&
              (claimState === "partial" || claimState === "failed") && (
                <div className="account-claim" role="status">
                  <p>{claimMessage ?? "访客数据尚未完整迁移"}</p>
                  <button
                    type="button"
                    className="account-text-button"
                    onClick={() => void claimCurrentGuest(sessionId)}
                  >
                    <RefreshCw size={14} />
                    重试认领
                  </button>
                </div>
              )}
          </section>
          <section
            className="account-card"
            aria-labelledby="account-security-title"
          >
            <h2 id="account-security-title" className="font-display">
              账号安全
            </h2>
            <div className="account-security-item">
              <LockKeyhole size={20} strokeWidth={1.5} />
              <div>
                <h3>登录密码</h3>
                <p>通过验证邮件，设置新的登录密码。</p>
                <button
                  type="button"
                  className="account-text-button"
                  onClick={() => setDialog("forgot")}
                >
                  找回密码
                </button>
              </div>
            </div>
            <div className="account-security-item">
              <ShieldCheck size={20} strokeWidth={1.5} />
              <div>
                <h3>私人书库</h3>
                <p>书籍、书内记忆和对话随账号保存。</p>
              </div>
            </div>
            <button
              type="button"
              className="account-secondary-button"
              aria-label="退出登录"
              disabled={loggingOut}
              onClick={() => void logout()}
            >
              {loggingOut ? "正在退出…" : "退出登录"}
            </button>
            {logoutError && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {logoutError}
              </p>
            )}
          </section>
        </div>
        <section
          className="account-appearance"
          aria-labelledby="account-appearance-title"
        >
          <div>
            <h2 id="account-appearance-title" className="font-display">
              书房外观
            </h2>
            <p>选择亮暗主题，或为书房换一张背景。</p>
          </div>
          <button
            type="button"
            className="account-secondary-button"
            onClick={() => {
              window.scrollTo({ top: 0, behavior: "instant" });
              setAppearanceRequest((request) => request + 1);
            }}
          >
            背景与主题
          </button>
        </section>
      </div>
      <Dialog
        open={dialog === "verify"}
        title="邮箱验证"
        onClose={() => setDialog(null)}
      >
        <p className="mb-5 break-all text-sm text-muted-foreground">
          {user.email}
        </p>
        {user.emailVerifiedAt ? (
          <p className="flex items-center gap-2 text-sm">
            <ShieldCheck size={18} />
            邮箱已验证
          </p>
        ) : (
          <EmailVerificationForm
            key={user.id}
            userId={user.id}
            onClose={() => setDialog(null)}
          />
        )}
      </Dialog>
      <Dialog
        open={dialog === "forgot"}
        title="找回密码"
        onClose={() => setDialog(null)}
      >
        <ForgotPasswordForm
          initialEmail={user.email}
          onBack={() => setDialog(null)}
          backLabel="返回账号"
          showTitle={false}
        />
      </Dialog>
    </main>
  );
}
