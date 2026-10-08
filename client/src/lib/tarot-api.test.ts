import { afterEach, expect, it, vi } from "vitest";
import { classifyTarot, revealTarot, streamTarotReading } from "./tarot-api";
vi.mock("./api", () => ({
  apiFetch: (...args: unknown[]) =>
    fetch(...(args as Parameters<typeof fetch>)),
}));
afterEach(() => vi.unstubAllGlobals());
const signal = () => new AbortController().signal;
it("accepts triangle classifications and positions, rejects unknown positions", async () => {
  const mock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        mode: "fixed",
        spread: "triangle",
        reason: null,
        permit: "a".repeat(32),
      }),
    ),
  );
  vi.stubGlobal("fetch", mock);
  expect((await classifyTarot("合成问题", signal())).spread).toBe("triangle");
  mock.mockResolvedValue(
    new Response(
      JSON.stringify({
        revealedCount: 1,
        cardCountRequired: 3,
        card: { id: "major-17", reversed: false, position: "situation" },
      }),
    ),
  );
  expect((await revealTarot("b".repeat(32), 0, signal())).card.position).toBe(
    "situation",
  );
  mock.mockResolvedValue(
    new Response(
      JSON.stringify({
        revealedCount: 1,
        cardCountRequired: 3,
        card: { id: "major-17", reversed: false, position: "unknown" },
      }),
    ),
  );
  await expect(revealTarot("b".repeat(32), 0, signal())).rejects.toThrow(
    "TAROT_INVALID_RESPONSE",
  );
});
const response = (chunks: string[]) =>
  new Response(
    new ReadableStream({
      start(controller) {
        const bytes = new TextEncoder().encode(chunks.join(""));
        for (let i = 0; i < bytes.length; i += 3)
          controller.enqueue(bytes.slice(i, i + 3));
        controller.close();
      },
    }),
  );

it("validates classifications and surfaces HTTP error codes", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          mode: "choose",
          spread: null,
          reason: "unclear",
          permit: "a".repeat(32),
        }),
      ),
    ),
  );
  expect((await classifyTarot("测试", signal())).reason).toBe("unclear");
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ code: "TAROT_RATE_LIMITED", retryAfterSeconds: 12 }),
          { status: 429 },
        ),
      ),
  );
  await expect(classifyTarot("测试", signal())).rejects.toMatchObject({
    code: "TAROT_RATE_LIMITED",
    retryAfterSeconds: 12,
  });
});
it("decodes split UTF-8 and CRLF SSE and requires a terminal event", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        response([
          'data: {"content":"第一段中文"}\r\n\r\n',
          'data: {"content":"继续"}\n\n',
          'data: {"done":true}\n\n',
        ]),
      ),
  );
  const contents: string[] = [];
  await streamTarotReading("a".repeat(32), signal(), (text) =>
    contents.push(text),
  );
  expect(contents).toEqual(["第一段中文", "继续"]);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(response(['data: {"content":"部分"}\n\n'])),
  );
  await expect(
    streamTarotReading("a".repeat(32), signal(), () => {}),
  ).rejects.toMatchObject({ code: "TAROT_INTERPRET_FAILED" });
});
it("propagates errors without converting them into successful completion", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        response(['data: {"error":{"code":"TAROT_INTERPRET_FAILED"}}\n\n']),
      ),
  );
  await expect(
    streamTarotReading("a".repeat(32), signal(), () => {}),
  ).rejects.toMatchObject({ code: "TAROT_INTERPRET_FAILED" });
});
