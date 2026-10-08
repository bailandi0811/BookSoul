import { act, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useTarotRound } from "./useTarotRound";
import { useAuthStore } from "@/store/useAuthStore";
import {
  classifyTarot,
  drawTarot,
  revealTarot,
  streamTarotReading,
} from "@/lib/tarot-api";
vi.mock("@/lib/tarot-api", () => ({
  classifyTarot: vi.fn(),
  drawTarot: vi.fn(),
  revealTarot: vi.fn(),
  streamTarotReading: vi.fn(),
  tarotErrorText: (error: unknown) =>
    error instanceof Error ? error.message : "请求失败",
}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.resetAllMocks());

async function setup() {
  let round!: ReturnType<typeof useTarotRound>;
  function Host() {
    const value = useTarotRound();
    useLayoutEffect(() => {
      round = value;
    });
    return null;
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<Host />));
  return {
    round: () => round,
    close: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}
it("skips choice for fixed spread and retains cards after reading fails", async () => {
  vi.mocked(classifyTarot).mockResolvedValue({
    mode: "fixed",
    spread: "yes_no",
    reason: null,
    permit: "a".repeat(32),
  });
  vi.mocked(drawTarot).mockResolvedValue({
    readingId: "b".repeat(32),
    spread: "yes_no",
    expiresAt: 9999999999,
    cardCount: 78,
  });
  vi.mocked(revealTarot).mockResolvedValue({
    revealedCount: 1,
    cardCountRequired: 1,
    card: { id: "major-17", reversed: false, position: "answer" },
  });
  vi.mocked(streamTarotReading).mockRejectedValue(new Error("解读失败"));
  const host = await setup();
  try {
    await act(async () => host.round().submit("测试问题"));
    expect(host.round().state.phase).toBe("drawing");
    await act(async () => host.round().reveal(0));
    expect(host.round().state.phase).toBe("failed");
    expect(host.round().state.cards).toHaveLength(1);
    expect(host.round().state.error).toBe("解读失败");
  } finally {
    await host.close();
  }
});
it("reads a full triangle in canonical order and refuses time slots in it", async () => {
  vi.mocked(classifyTarot).mockResolvedValue({
    mode: "fixed",
    spread: "triangle",
    reason: null,
    permit: "a".repeat(32),
  });
  vi.mocked(drawTarot).mockResolvedValue({
    readingId: "b".repeat(32),
    spread: "triangle",
    expiresAt: 9999999999,
    cardCount: 78,
  });
  vi.mocked(streamTarotReading).mockResolvedValue();
  const host = await setup();
  try {
    await act(async () => host.round().submit("状态和阻碍"));
    for (const [i, position] of (
      ["situation", "obstacle", "outlook"] as const
    ).entries()) {
      vi.mocked(revealTarot).mockResolvedValue({
        revealedCount: i + 1,
        cardCountRequired: 3,
        card: { id: `major-0${i}`, reversed: false, position },
      });
      await act(async () => host.round().reveal(i));
    }
    expect(host.round().state.cards).toHaveLength(3);
    expect(streamTarotReading).toHaveBeenCalledTimes(1);
    await act(async () => host.round().reset());
    await act(async () => host.round().submit("另一个问题"));
    vi.mocked(revealTarot).mockResolvedValue({
      revealedCount: 1,
      cardCountRequired: 3,
      card: { id: "major-17", reversed: false, position: "past" },
    });
    await act(async () => host.round().reveal(0));
    expect(host.round().state.phase).toBe("failed");
    expect(host.round().state.cards).toHaveLength(0);
    expect(streamTarotReading).toHaveBeenCalledTimes(1);
  } finally {
    await host.close();
  }
});
it("ignores old classification responses after reset and aborts them", async () => {
  let finish!: (value: Awaited<ReturnType<typeof classifyTarot>>) => void;
  vi.mocked(classifyTarot).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const host = await setup();
  try {
    let pending!: Promise<void>;
    await act(async () => {
      pending = host.round().submit("旧问题");
    });
    const signal = vi.mocked(classifyTarot).mock.calls[0][1];
    await act(async () => host.round().reset());
    expect(signal.aborted).toBe(true);
    await act(async () => {
      finish({
        mode: "fixed",
        spread: "yes_no",
        reason: null,
        permit: "a".repeat(32),
      });
      await pending;
    });
    expect(host.round().state.phase).toBe("question");
    expect(drawTarot).not.toHaveBeenCalled();
  } finally {
    await host.close();
  }
});
it("offers choice for unclear and clears all state on auth generation change", async () => {
  vi.mocked(classifyTarot).mockResolvedValue({
    mode: "choose",
    spread: null,
    reason: "unclear",
    permit: "a".repeat(32),
  });
  const host = await setup();
  const generation = useAuthStore.getState().authGeneration;
  try {
    await act(async () => host.round().submit("测试"));
    expect(host.round().state.phase).toBe("choose");
    await act(async () =>
      useAuthStore.setState({ authGeneration: generation + 1 }),
    );
    expect(host.round().state.question).toBe("");
    expect(host.round().state.phase).toBe("question");
  } finally {
    await host.close();
    useAuthStore.setState({ authGeneration: generation });
  }
});
it("serializes reveals and ignores a late reveal after leaving the route", async () => {
  vi.mocked(classifyTarot).mockResolvedValue({
    mode: "fixed",
    spread: "yes_no",
    reason: null,
    permit: "a".repeat(32),
  });
  vi.mocked(drawTarot).mockResolvedValue({
    readingId: "b".repeat(32),
    spread: "yes_no",
    expiresAt: 9999999999,
    cardCount: 78,
  });
  let finish!: (value: Awaited<ReturnType<typeof revealTarot>>) => void;
  vi.mocked(revealTarot).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const host = await setup();
  try {
    await act(async () => host.round().submit("测试"));
    let pending!: Promise<void>;
    await act(async () => {
      pending = host.round().reveal(0);
      await host.round().reveal(1);
    });
    expect(revealTarot).toHaveBeenCalledTimes(1);
    await act(async () => {
      window.location.hash = "";
      window.dispatchEvent(new Event("hashchange"));
    });
    expect(vi.mocked(revealTarot).mock.calls[0][2].aborted).toBe(true);
    await act(async () => {
      finish({
        revealedCount: 1,
        cardCountRequired: 1,
        card: { id: "major-17", reversed: false, position: "answer" },
      });
      await pending;
    });
    expect(host.round().state.cards).toEqual([]);
    expect(streamTarotReading).not.toHaveBeenCalled();
  } finally {
    await host.close();
  }
});
