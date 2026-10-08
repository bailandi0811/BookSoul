import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { TarotPage } from "./TarotPage";
import { useTarotRound } from "./useTarotRound";
vi.mock("./useTarotRound");
vi.mock("@/components/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("@/components/ScenicBackground", () => ({
  ScenicBackground: () => null,
}));
vi.mock("framer-motion", async () => ({
  ...(await vi.importActual("framer-motion")),
  useReducedMotion: () => true,
}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.resetAllMocks());
const state = () => ({
  phase: "question" as const,
  question: "",
  classification: null,
  draw: null,
  cards: [],
  content: "",
  error: null,
  pendingIndex: null,
});
async function render(value: ReturnType<typeof useTarotRound>["state"]) {
  const reset = vi.fn();
  vi.mocked(useTarotRound).mockReturnValue({
    state: value,
    reset,
    setQuestion: vi.fn(),
    submit: vi.fn(),
    choose: vi.fn(),
    reveal: vi.fn(),
    retryReading: vi.fn(),
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<TarotPage onBack={() => {}} />));
  return {
    container,
    reset,
    close: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}
it("shows triangle slots before and after drawing and offers three choices", async () => {
  const host = await render({
    ...state(),
    phase: "drawing",
    draw: {
      readingId: "b".repeat(32),
      spread: "triangle",
      expiresAt: 9999999999,
      cardCount: 78,
    },
  });
  try {
    expect(host.container.textContent).toContain("现状");
    expect(host.container.textContent).toContain("圣三角");
    expect(host.container.textContent).toContain("阻碍");
    expect(host.container.textContent).toContain("发展趋势");
    expect(host.container.textContent).not.toContain("过去");
  } finally {
    await host.close();
  }
  const choose = await render({
    ...state(),
    phase: "choose",
    classification: {
      mode: "choose",
      spread: null,
      reason: "unclear",
      permit: "a".repeat(32),
    },
  });
  try {
    expect(choose.container.textContent).toContain("圣三角");
    expect(
      choose.container.querySelectorAll(".tarot-choices button"),
    ).toHaveLength(3);
  } finally {
    await choose.close();
  }
});
it("renders all 78 card backs and empty slots without revealing a card", async () => {
  const host = await render(state());
  try {
    const buttons =
      host.container.querySelectorAll<HTMLButtonElement>(".tarot-card-back");
    expect(buttons).toHaveLength(78);
    expect([...buttons].every((button) => button.disabled)).toBe(true);
    expect(host.container.querySelectorAll(".tarot-slot")).toHaveLength(3);
    expect(
      host.container.querySelectorAll(".tarot-slot-face img"),
    ).toHaveLength(0);
    expect(host.container.textContent).toContain("TypeSafe");
  } finally {
    await host.close();
  }
});
it("retains reversed card and meanings on failure and offers reading retry", async () => {
  const host = await render({
    ...state(),
    phase: "failed",
    question: "测试",
    classification: {
      mode: "fixed",
      spread: "yes_no",
      reason: null,
      permit: "a".repeat(32),
    },
    draw: {
      readingId: "b".repeat(32),
      spread: "yes_no",
      expiresAt: 9999999999,
      cardCount: 78,
    },
    cards: [{ id: "major-17", reversed: true, position: "answer", index: 2 }],
    error: "解读失败",
  });
  try {
    const image = host.container.querySelector<HTMLImageElement>(
      ".tarot-slot-face img",
    )!;
    expect(image.alt).toContain("逆位");
    expect(image.style.transform).toBe("rotate(180deg)");
    expect(host.container.querySelector(".tarot-meanings")).not.toBeNull();
    expect(host.container.textContent).toContain("用这些牌重新解读");
    expect(
      host.container.querySelectorAll('[aria-pressed="true"]'),
    ).toHaveLength(1);
    await act(async () => image.dispatchEvent(new Event("error")));
    expect(
      host.container.querySelector(".tarot-illustration")?.textContent,
    ).toContain("星星");
  } finally {
    await host.close();
  }
});
it("only retries the locked spread after a fixed classification", async () => {
  const host = await render({
    ...state(),
    phase: "failed",
    classification: {
      mode: "fixed",
      spread: "three_card",
      reason: null,
      permit: "a".repeat(32),
    },
    error: "洗牌失败",
  });
  try {
    expect(
      host.container.querySelectorAll(".tarot-choices button"),
    ).toHaveLength(1);
    expect(host.container.textContent).toContain("重试原牌阵");
  } finally {
    await host.close();
  }
});
it("places the question above the table and guides the unselected round on the paper", async () => {
  const host = await render({
    ...state(),
    phase: "drawing",
    question: "我们以后的关系会怎么发展？",
    classification: {
      mode: "fixed",
      spread: "three_card",
      reason: null,
      permit: "a".repeat(32),
    },
    draw: {
      readingId: "b".repeat(32),
      spread: "three_card",
      expiresAt: 9999999999,
      cardCount: 78,
    },
  });
  try {
    expect(
      host.container.querySelector(".tarot-question-bar")?.textContent,
    ).toContain("我们以后的关系会怎么发展？");
    const paper = host.container.querySelector(".tarot-paper")!;
    expect(paper.textContent).toContain("先选牌，再听回应");
    expect(paper.textContent).toContain("已选 0 / 3 张");
    expect(paper.querySelector("textarea")).toBeNull();
  } finally {
    await host.close();
  }
});
it("renders reading markdown without fetching model-supplied images or rendering raw HTML", async () => {
  const host = await render({
    ...state(),
    phase: "complete",
    question: "测试",
    classification: {
      mode: "fixed",
      spread: "yes_no",
      reason: null,
      permit: "a".repeat(32),
    },
    draw: {
      readingId: "b".repeat(32),
      spread: "yes_no",
      expiresAt: 9999999999,
      cardCount: 78,
    },
    cards: [{ id: "major-17", reversed: false, position: "answer", index: 0 }],
    content:
      '**真实的联结**，需要双向回应。\n\n- 留一点空间\n- 说清期待\n\n<img src="https://example.invalid/raw.png" onerror="alert(1)">\n\n![外部图片](https://example.invalid/image.png)',
  });
  try {
    const reading = host.container.querySelector(".tarot-reading")!;
    expect(reading.querySelector("strong")?.textContent).toBe("真实的联结");
    expect(reading.querySelectorAll("li")).toHaveLength(2);
    expect(reading.textContent).not.toContain("**");
    expect(reading.querySelectorAll("img,script")).toHaveLength(0);
  } finally {
    await host.close();
  }
});
