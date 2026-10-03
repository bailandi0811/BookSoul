import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  confirmCurrentUserEmail,
  requestCurrentUserVerificationCode,
} from "@/lib/auth-api";
import { useAuthStore } from "@/store/useAuthStore";
import { useVerificationChallenge } from "./useVerificationChallenge";
import { VerificationCodeField } from "./VerificationCodeField";
const requestCode = (_userId: string, options: { signal: AbortSignal }) =>
  requestCurrentUserVerificationCode(options);
export function EmailVerificationForm({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const challenge = useVerificationChallenge(userId, requestCode);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), [userId]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!challenge.receipt || !/^[0-9]{6}$/.test(challenge.code)) {
      setError("请先申请并输入 6 位验证码");
      return;
    }
    const pending = new AbortController();
    controller.current = pending;
    setBusy(true);
    setError("");
    try {
      await confirmCurrentUserEmail(
        {
          verificationId: challenge.receipt.verificationId,
          code: challenge.code,
        },
        { signal: pending.signal },
      );
      if (
        !pending.signal.aborted &&
        useAuthStore.getState().user?.id === userId
      )
        onClose();
    } catch (cause) {
      if (!pending.signal.aborted)
        setError(cause instanceof Error ? cause.message : "验证失败，请重试");
    } finally {
      if (!pending.signal.aborted) setBusy(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-xl border border-border bg-card p-3"
    >
      <p className="text-sm text-muted-foreground">
        验证当前账号邮箱，已有书籍和登录可继续使用。
      </p>
      <VerificationCodeField
        code={challenge.code}
        onCodeChange={challenge.onCodeChange}
        sending={challenge.sending}
        resendAfterSeconds={challenge.resendAfterSeconds}
        onRequestCode={() => void challenge.requestCode()}
      />
      {challenge.receipt && (
        <p role="status" className="text-xs text-muted-foreground">
          申请已受理，请查收邮件；验证码 10 分钟内有效。
        </p>
      )}
      {(error || challenge.error || challenge.expired) && (
        <p role="alert" className="text-sm text-destructive">
          {error || challenge.error || "验证码已过期，请重新申请"}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
      >
        {busy ? "正在验证…" : "确认验证"}
      </button>
      <button
        type="button"
        onClick={onClose}
        className="ml-3 text-sm text-muted-foreground"
      >
        稍后验证
      </button>
    </form>
  );
}
