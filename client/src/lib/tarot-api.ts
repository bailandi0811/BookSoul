import { apiFetch } from "./api";
import { TAROT_DECK } from "./tarot-deck.generated";
import { TAROT_SPREADS } from "./tarot-spreads";
import type {
  TarotClassification,
  TarotDraw,
  TarotReveal,
  TarotSpread,
} from "./tarot-types";

export class TarotError extends Error {
  constructor(
    public code: string,
    public retryAfterSeconds?: number,
  ) {
    super(code);
  }
}
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TarotError("TAROT_INVALID_RESPONSE");
  return value as Record<string, unknown>;
}
const id = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{32}$/.test(value);
const spread = (value: unknown): value is TarotSpread =>
  TAROT_SPREADS.some((item) => item.id === value);
async function post(path: string, body: unknown, signal: AbortSignal) {
  const response = await apiFetch(`/api/tarot/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    let data: Record<string, unknown> = {};
    try {
      data = record(await response.json());
    } catch {
      /* An HTTP error can have no JSON body. */
    }
    throw new TarotError(
      typeof data.code === "string" ? data.code : "TAROT_REQUEST_FAILED",
      typeof data.retryAfterSeconds === "number"
        ? data.retryAfterSeconds
        : undefined,
    );
  }
  return response;
}
export async function classifyTarot(
  question: string,
  signal: AbortSignal,
): Promise<TarotClassification> {
  const data = record(
    await (await post("classifications", { question }, signal)).json(),
  );
  if (
    !id(data.permit) ||
    !(
      (data.mode === "fixed" && spread(data.spread) && data.reason === null) ||
      (data.mode === "choose" &&
        data.spread === null &&
        ["low_confidence", "unclear", "unavailable"].includes(
          String(data.reason),
        ))
    )
  )
    throw new TarotError("TAROT_INVALID_RESPONSE");
  return data as unknown as TarotClassification;
}
export async function drawTarot(
  permit: string,
  selected: TarotSpread,
  signal: AbortSignal,
): Promise<TarotDraw> {
  const data = record(
    await (await post("draws", { permit, spread: selected }, signal)).json(),
  );
  if (
    !id(data.readingId) ||
    data.spread !== selected ||
    data.cardCount !== 78 ||
    typeof data.expiresAt !== "number" ||
    !Number.isSafeInteger(data.expiresAt)
  )
    throw new TarotError("TAROT_INVALID_RESPONSE");
  return data as unknown as TarotDraw;
}
export async function revealTarot(
  readingId: string,
  index: number,
  signal: AbortSignal,
): Promise<TarotReveal> {
  const data = record(
    await (await post("reveals", { readingId, index }, signal)).json(),
  );
  const card = record(data.card);
  if (
    !TAROT_DECK.some((item) => item.id === card.id) ||
    typeof card.reversed !== "boolean" ||
    !TAROT_SPREADS.some((item) =>
      item.positions.some((position) => position.id === card.position),
    ) ||
    ![1, 3].includes(Number(data.cardCountRequired)) ||
    typeof data.revealedCount !== "number" ||
    !Number.isInteger(data.revealedCount) ||
    data.revealedCount < 1 ||
    data.revealedCount > Number(data.cardCountRequired)
  )
    throw new TarotError("TAROT_INVALID_RESPONSE");
  return data as unknown as TarotReveal;
}
export async function streamTarotReading(
  readingId: string,
  signal: AbortSignal,
  onContent: (text: string) => void,
): Promise<void> {
  const response = await post("readings", { readingId }, signal);
  if (!response.body) throw new TarotError("TAROT_INTERPRET_FAILED");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;
  try {
    while (!done) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      let separator: RegExpExecArray | null;
      while ((separator = /\r?\n\r?\n/.exec(buffer))) {
        const event = buffer.slice(0, separator.index);
        buffer = buffer.slice(separator.index + separator[0].length);
        const payload = event
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!payload) continue;
        const data = record(JSON.parse(payload));
        signal.throwIfAborted();
        if (data.error) {
          const error = record(data.error);
          throw new TarotError(
            typeof error.code === "string"
              ? error.code
              : "TAROT_INTERPRET_FAILED",
          );
        }
        if (data.done === true) {
          done = true;
          break;
        }
        if (typeof data.content !== "string")
          throw new TarotError("TAROT_INVALID_RESPONSE");
        onContent(data.content);
      }
      if (buffer.length > 100_000)
        throw new TarotError("TAROT_INVALID_RESPONSE");
      if (chunk.done) break;
    }
    if (!done) throw new TarotError("TAROT_INTERPRET_FAILED");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export function tarotErrorText(error: unknown): string {
  const code = error instanceof TarotError ? error.code : "";
  const messages: Record<string, string> = {
    TAROT_UNAUTHENTICATED: "登录已失效，请重新登录。",
    TAROT_RATE_LIMITED: "今天的思绪有些密集，请稍后再试。",
    TAROT_READING_BUSY: "解读正在进行，请稍后再试。",
    TAROT_CONCURRENCY_LIMITED: "书房暂时忙碌，请稍后再试。",
    TAROT_CAPACITY_EXCEEDED: "书房暂时忙碌，请稍后再试。",
    TAROT_DRAW_INVALID: "这次占卜已过期，请重新开始。",
    TAROT_PERMIT_INVALID: "提问已过期，请重新开始。",
    TAROT_INTERPRET_FAILED: "解读暂时没有完成，牌面仍然可以看。",
  };
  return (
    (messages[code] ?? "暂时连接不上书房，请重试。") +
    (error instanceof TarotError && error.retryAfterSeconds
      ? ` ${error.retryAfterSeconds} 秒后可重试。`
      : "")
  );
}
