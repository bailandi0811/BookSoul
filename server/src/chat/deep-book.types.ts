export type RetrievalMode = 'quick' | 'deep';
export const DEEP_BOOK_LIMITS = Object.freeze({
  requestMs: 90000,
  heartbeatMs: 10000,
});
export interface DeepRunSummary {
  modelCalls?: number;
  toolCalls?: number;
  mode: 'deep';
  stopReason: 'satisfied' | 'round_limit' | 'no_progress' | 'no_queries';
  retrievalRounds: number;
  incomplete: boolean;
}
export class DeepBookError extends Error {
  constructor(
    readonly code:
      | 'DEEP_MODE_TIMEOUT'
      | 'DEEP_MODE_OUTPUT_INVALID'
      | 'DEEP_MODE_UNAVAILABLE'
      | 'BOOK_CONTEXT_CHANGED',
    readonly diagnostic?: {
      stage:
        | 'plan'
        | 'check'
        | 'generate'
        | 'orchestrate'
        | 'bootstrap'
        | 'agent'
        | 'book_search'
        | 'memory_recall'
        | 'external_research'
        | 'email'
        | 'history'
        | 'memory_commit';
      reason:
        | 'schema_invalid'
        | 'coverage_invalid'
        | 'json_invalid'
        | 'output_truncated'
        | 'content_invalid'
        | 'prompt_too_large'
        | 'empty_answer'
        | 'result_invalid'
        | 'tool_forbidden'
        | 'tool_calls_invalid'
        | 'stage_timeout';
    },
  ) {
    super(code);
    this.name = 'DeepBookError';
  }
}

export function assertDeepActive(signal: AbortSignal): void {
  if (signal.aborted)
    throw signal.reason instanceof Error
      ? signal.reason
      : new DOMException('Aborted', 'AbortError');
}

// Racing releases the online request. Every caller must also fence continuation
// with the same signal; late transports remain observed by Promise.race.
export async function awaitDeepActive<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) void promise.catch(() => undefined);
  assertDeepActive(signal);
  let listener: () => void = () => undefined;
  const aborted = new Promise<never>((_, reject) => {
    listener = () =>
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : new DOMException('Aborted', 'AbortError'),
      );
    signal.addEventListener('abort', listener, { once: true });
    if (signal.aborted) listener();
  });
  try {
    const value = await Promise.race([promise, aborted]);
    assertDeepActive(signal);
    return value;
  } finally {
    signal.removeEventListener('abort', listener);
  }
}

export function deepDeadline(
  parent: AbortSignal,
  milliseconds: number,
  stage: NonNullable<DeepBookError['diagnostic']>['stage'] = 'orchestrate',
): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(
    () =>
      controller.abort(
        new DeepBookError('DEEP_MODE_TIMEOUT', {
          stage,
          reason: 'stage_timeout',
        }),
      ),
    milliseconds,
  );
  return {
    signal: AbortSignal.any([parent, controller.signal]),
    dispose: () => clearTimeout(timer),
  };
}
