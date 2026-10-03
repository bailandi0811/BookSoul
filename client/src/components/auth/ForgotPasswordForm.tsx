import { useEffect, useRef, useState, type FormEvent } from "react";
import { AuthFlowError, requestPasswordReset } from "@/lib/auth-api";
export function ForgotPasswordForm({
  initialEmail,
  onBack,
  backLabel = "返回登录",
  showTitle = true,
}: {
  initialEmail: string;
  onBack: () => void;
  backLabel?: string;
  showTitle?: boolean;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(timer);
      controller.current?.abort();
    };
  }, []);
  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || remaining) return;
    const pending = new AbortController();
    controller.current = pending;
    setBusy(true);
    setError("");
    try {
      const result = await requestPasswordReset(email.trim().toLowerCase(), {
        signal: pending.signal,
      });
      if (pending.signal.aborted) return;
      const accepted = Date.now();
      setNow(accepted);
      setDeadline(accepted + result.resendAfterSeconds * 1000);
      setMessage(result.message);
    } catch (cause) {
      if (!pending.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "申请失败，请重试");
        if (cause instanceof AuthFlowError && cause.retryAfterSeconds) {
          const failed = Date.now();
          setNow(failed);
          setDeadline(failed + cause.retryAfterSeconds * 1000);
        }
      }
    } finally {
      if (!pending.signal.aborted) setBusy(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="space-y-5 auth-simple-form"
      autoComplete="off"
    >
      {showTitle && <h2 className="auth-title font-display">找回密码</h2>}
      <p className="text-sm text-muted-foreground">
        输入注册邮箱，通过邮件链接设置新密码。
      </p>
      <label className="block space-y-2 text-sm">
        <span>邮箱</span>
        <input
          type="email"
          required
          maxLength={254}
          value={email}
          onChange={(event) => {
            controller.current?.abort();
            setBusy(false);
            setEmail(event.target.value);
            setMessage("");
            setError("");
            setDeadline(0);
          }}
          autoComplete="off"
          data-1p-ignore
          className="w-full rounded-xl border border-input bg-background px-3.5 py-3"
        />
      </label>
      {message && (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || remaining > 0}
        className="w-full rounded-xl bg-primary px-4 py-3 text-sm text-primary-foreground disabled:opacity-50"
      >
        {busy
          ? "正在申请…"
          : remaining > 0
            ? `${remaining} 秒后可重试`
            : "发送重置邮件"}
      </button>
      <button type="button" onClick={onBack} className="text-sm text-primary">
        {backLabel}
      </button>
    </form>
  );
}
