const AUTH_REQUEST_TIMEOUT_MS = 10_000;

// The deadline includes waiting for a tab lock and reading the response body.
export async function withAuthTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  parentSignal?: AbortSignal,
): Promise<T> {
  parentSignal?.throwIfAborted();
  const controller = new AbortController();
  const cancel = () => controller.abort(parentSignal?.reason);
  let rejectOnAbort!: () => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectOnAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener("abort", rejectOnAbort, { once: true });
  });
  parentSignal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(
    () => controller.abort(new DOMException("认证服务连接超时", "TimeoutError")),
    AUTH_REQUEST_TIMEOUT_MS,
  );
  try {
    return await Promise.race([
      Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return operation(controller.signal);
      }),
      aborted,
    ]);
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", cancel);
    controller.signal.removeEventListener("abort", rejectOnAbort);
  }
}
