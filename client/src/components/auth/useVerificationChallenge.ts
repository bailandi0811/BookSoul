import { useEffect, useRef, useState } from "react";
import { AuthFlowError, type ChallengeReceipt } from "@/lib/auth-api";
type ChallengeState = {
  scope: string;
  receipt: ChallengeReceipt | null;
  code: string;
  busy: boolean;
  error: string | null;
  deadline: number;
  expiresAt: number;
};
const empty = (scope: string): ChallengeState => ({
  scope,
  receipt: null,
  code: "",
  busy: false,
  error: null,
  deadline: 0,
  expiresAt: 0,
});
export function useVerificationChallenge(
  scope: string,
  request: (
    scope: string,
    options: { signal: AbortSignal },
  ) => Promise<ChallengeReceipt>,
) {
  const [state, setState] = useState(() => empty(scope));
  const [now, setNow] = useState(() => Date.now());
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  useEffect(
    () => () => {
      controller.current?.abort();
      sequence.current++;
    },
    [scope],
  );
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const current = state.scope === scope ? state : empty(scope);
  const requestCode = async () => {
    controller.current?.abort();
    const pending = new AbortController();
    controller.current = pending;
    const generation = ++sequence.current;
    setState({ ...empty(scope), busy: true });
    try {
      const receipt = await request(scope, { signal: pending.signal });
      if (pending.signal.aborted || generation !== sequence.current) return;
      const accepted = Date.now();
      setNow(accepted);
      setState({
        ...empty(scope),
        receipt,
        deadline: accepted + receipt.resendAfterSeconds * 1000,
        expiresAt: accepted + receipt.expiresInSeconds * 1000,
      });
    } catch (cause) {
      if (pending.signal.aborted || generation !== sequence.current) return;
      const retry =
        cause instanceof AuthFlowError ? cause.retryAfterSeconds : undefined;
      const failed = Date.now();
      setNow(failed);
      setState({
        ...empty(scope),
        error:
          cause instanceof Error ? cause.message : "验证码申请失败，请重试",
        deadline:
          retry ||
          (cause instanceof AuthFlowError && cause.code === "AUTH_RATE_LIMITED")
            ? failed + (retry ?? 60) * 1000
            : 0,
      });
    }
  };
  return {
    clear: () => {
      controller.current?.abort();
      sequence.current++;
      setState(empty(scope));
    },
    receipt:
      current.receipt && current.expiresAt > now ? current.receipt : null,
    code: current.code,
    sending: current.busy,
    error: current.error,
    expired: Boolean(current.receipt && current.expiresAt <= now),
    resendAfterSeconds: Math.max(0, Math.ceil((current.deadline - now) / 1000)),
    onCodeChange: (code: string) => setState({ ...current, code }),
    requestCode,
  };
}
