import { useEffect, useRef, useState, type FormEvent } from "react";
import { resetPassword } from "@/lib/auth-api";
import { validateNewPassword } from "@/lib/auth-password-policy";
import { AuthShell } from "./AuthShell";
export function ResetPasswordPage({
  token,
  onComplete,
  onExit,
}: {
  token: string | null;
  onComplete: () => void;
  onExit: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), [token]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token || busy || success) return;
    const policy = validateNewPassword(password);
    if (policy) {
      setError(policy);
      return;
    }
    if (password !== confirmation) {
      setError("两次输入的密码不一致");
      return;
    }
    const pending = new AbortController();
    controller.current = pending;
    setBusy(true);
    setError("");
    try {
      await resetPassword(
        { token, newPassword: password },
        { signal: pending.signal },
      );
      if (!pending.signal.aborted) {
        setPassword("");
        setConfirmation("");
        setSuccess(true);
        onComplete();
      }
    } catch (cause) {
      if (!pending.signal.aborted)
        setError(cause instanceof Error ? cause.message : "重置失败，请重试");
    } finally {
      if (!pending.signal.aborted) setBusy(false);
    }
  }
  return (
    <AuthShell>
      <div className="space-y-5 auth-simple-form">
        <h2 className="auth-title font-display">
          {success ? "密码已重置" : "设置新密码"}
        </h2>
        {success ? (
          <p role="status" className="text-sm text-muted-foreground">
            密码已重置，请重新登录。
          </p>
        ) : !token ? (
          <p role="alert" className="text-sm text-destructive">
            重置链接无效或缺少凭证，请返回登录页重新申请。
          </p>
        ) : (
          <form onSubmit={submit} autoComplete="off" className="space-y-4">
            <label className="block space-y-2 text-sm">
              <span>新密码</span>
              <input
                name="new-password"
                type="password"
                autoComplete="new-password"
                data-1p-ignore
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3.5 py-3"
              />
            </label>
            <label className="block space-y-2 text-sm">
              <span>确认新密码</span>
              <input
                name="confirm-password"
                type="password"
                autoComplete="new-password"
                data-1p-ignore
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3.5 py-3"
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-primary px-4 py-3 text-sm text-primary-foreground disabled:opacity-50"
            >
              {busy ? "正在重置…" : "重置密码"}
            </button>
          </form>
        )}
        <button type="button" onClick={onExit} className="text-sm text-primary">
          {success ? "前往登录" : "返回登录，重新申请"}
        </button>
      </div>
    </AuthShell>
  );
}
