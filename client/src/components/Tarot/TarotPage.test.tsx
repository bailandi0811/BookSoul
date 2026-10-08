import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
function setMobileMatch(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: matches && query === "(max-width: 800px)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
beforeEach(() => setMobileMatch(true));
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
  const reveal = vi.fn();
  vi.mocked(useTarotRound).mockReturnValue({
    state: value,
    reset,
    setQuestion: vi.fn(),
    submit: vi.fn(),
    choose: vi.fn(),
    reveal,
    retryReading: vi.fn(),
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<TarotPage onBack={() => {}} />));
  return {
    container,
    reset,
    reveal,
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

it("keeps the opening manuscript focused on a single question", async () => {
  const host = await render(state());
  try {
    expect(
      host.container.querySelector(".tarot-layout")?.getAttribute("data-stage"),
    ).toBe("question");
    expect(host.container.querySelector(".tarot-question-bar")).toBeNull();
    expect(host.container.querySelector(".tarot-reset")).toBeNull();
    expect(host.container.querySelector(".tarot-bottom-note")).toBeNull();
    expect(
      host.container.querySelector(".tarot-table")?.getAttribute("data-inactive"),
    ).toBe("true");
    const panel = host.container.querySelector(".tarot-question-panel");
    expect(panel?.getAttribute("data-variant")).toBe("prompt-sheet");
    expect(panel?.querySelector("h2")?.textContent).toContain(
      "写下此刻最想知道的事",
    );
    expect(panel?.querySelector("textarea")?.getAttribute("rows")).toBe("3");
    expect(panel?.querySelector(".tarot-question-actions button")).not.toBeNull();
    expect(panel?.querySelector(".tarot-question-actions")?.textContent).toContain(
      "0 / 300",
    );
    expect(panel?.querySelector(".tarot-disclosure summary")?.textContent).toBe(
      "问题仅用于选牌与解读",
    );
  } finally {
    await host.close();
  }
});

it("preserves the original question experience on wider screens", async () => {
  setMobileMatch(false);
  const host = await render(state());
  try {
    expect(host.container.querySelector(".tarot-reset")).not.toBeNull();
    expect(host.container.querySelector(".tarot-question-bar")?.textContent).toContain(
      "把一个悬而未决的念头，写在这里。",
    );
    const panel = host.container.querySelector(".tarot-question-panel")!;
    expect(panel.querySelector("h2")?.textContent).toContain(
      "今天，想问些什么？",
    );
    expect(panel.querySelector("textarea")?.getAttribute("placeholder")).toBe(
      "最近，我在犹豫…",
    );
    expect(panel.querySelector(".tarot-primary")?.textContent).toContain(
      "开始这一页",
    );
    expect(panel.querySelector(".tarot-disclosure")?.tagName).toBe("P");
    expect(host.container.querySelector(".tarot-bottom-note")).not.toBeNull();
  } finally {
    await host.close();
  }
});

it("uses a focused mobile orbit and confirms a card only from its center", async () => {
  const host = await render({
    ...state(),
    phase: "drawing",
    question: "我们以后会怎样？",
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
    const deck = host.container.querySelector(".tarot-deck")!;
    const cards = [
      ...host.container.querySelectorAll<HTMLButtonElement>(
        ".tarot-card-back",
      ),
    ];
    expect(deck.getAttribute("aria-label")).toBe(
      "78 张待抽卡牌，左右滑动选择",
    );
    expect(deck.getAttribute("data-layout")).toBe("orbit");
    expect(
      host.container.querySelector(".tarot-status-value")?.textContent,
    ).toBe("待抽取");
    expect(
      host.container.querySelector(".tarot-mobile-selection")?.textContent,
    ).toContain("已选 0 / 3 张");
    expect(
      host.container.querySelector(".tarot-mobile-deck-guide")?.textContent ??
        "",
    ).toContain("左右滑动");
    expect(cards).toHaveLength(78);
    expect(
      cards.filter((card) => card.dataset.focused === "true"),
    ).toHaveLength(1);
    expect(cards[38].dataset.focused).toBe("true");
    expect(cards[38].dataset.orbitDistance).toBe("0");
    expect(cards[34].dataset.orbitDistance).toBe("-4");
    expect(cards[42].dataset.orbitDistance).toBe("4");
    expect(
      cards.filter((card) => card.dataset.orbitVisible === "true"),
    ).toHaveLength(9);

    await act(async () => cards[0].click());
    expect(host.reveal).not.toHaveBeenCalled();
    expect(cards[0].dataset.focused).toBe("true");

    await act(async () => cards[0].click());
    expect(host.reveal).toHaveBeenCalledWith(0);
  } finally {
    await host.close();
  }
});

it("advances the mobile orbit beyond a card that has already been chosen", async () => {
  const host = await render({
    ...state(),
    phase: "drawing",
    question: "我们以后会怎样？",
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
    cards: [{ id: "major-00", reversed: false, position: "past", index: 38 }],
  });
  try {
    expect(
      host.container.querySelector('.tarot-card-back[data-card-index="38"]'),
    ).toBeNull();
    expect(
      host.container.querySelector<HTMLElement>(
        '.tarot-card-back[data-focused="true"]',
      )?.dataset.cardIndex,
    ).toBe("39");
  } finally {
    await host.close();
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
    ).toHaveLength(0);
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
    expect(host.container.querySelector(".tarot-reset")).not.toBeNull();
    expect(
      host.container.querySelector(".tarot-question-bar")?.textContent,
    ).toContain("我们以后的关系会怎么发展？");
    expect(
      host.container
        .querySelector(".tarot-question-bar")
        ?.getAttribute("data-continuity"),
    ).toBe("settled-question");
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

it("turns a completed mobile round into a flowing manuscript linked to its cards", async () => {
  const host = await render({
    ...state(),
    phase: "complete",
    question: "我们以后会怎样？",
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
    cards: [
      { id: "major-00", reversed: false, position: "past", index: 0 },
      { id: "major-01", reversed: true, position: "present", index: 1 },
      { id: "major-02", reversed: false, position: "future", index: 2 },
    ],
    content:
      "## 整体倾向\n这是一段综合回应。\n\n## 过去\n从过去的牌面开始。\n\n## 现在\n看清此刻。\n\n## 未来\n保留可能。\n\n## 可以尝试\n先说出真实想法。",
  });
  try {
    expect(
      host.container.querySelector(".tarot-layout")?.getAttribute("data-stage"),
    ).toBe("reading");
    expect(
      host.container.querySelector(".tarot-table")?.getAttribute("data-complete"),
    ).toBe("true");
    expect(
      host.container.querySelector(".tarot-status-value")?.textContent,
    ).toBe("解读完成");
    expect(
      host.container.querySelector(".tarot-reading-panel h2 .tarot-leaf"),
    ).not.toBeNull();
    expect(
      host.container.querySelector(".tarot-layout > .tarot-result-corners"),
    ).not.toBeNull();
    expect(host.container.querySelector(".tarot-deck-well")).toBeNull();
    expect(
      host.container.querySelectorAll(".tarot-reading-heading-card"),
    ).toHaveLength(3);
    expect(
      host.container.querySelector<HTMLImageElement>(
        ".tarot-reading-heading-card img",
      )?.alt,
    ).toContain("愚者");
  } finally {
    await host.close();
  }
});

it("preserves the completed table and reading treatment on wider screens", async () => {
  setMobileMatch(false);
  const host = await render({
    ...state(),
    phase: "complete",
    question: "我们以后会怎样？",
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
    cards: [
      { id: "major-00", reversed: false, position: "past", index: 0 },
      { id: "major-01", reversed: true, position: "present", index: 1 },
      { id: "major-02", reversed: false, position: "future", index: 2 },
    ],
    content:
      "## 整体倾向\n这是一段综合回应。\n\n## 过去\n从过去的牌面开始。\n\n## 现在\n看清此刻。\n\n## 未来\n保留可能。",
  });
  try {
    expect(host.container.querySelector(".tarot-deck-well")).not.toBeNull();
    expect(host.container.querySelectorAll(".tarot-card-back")).toHaveLength(78);
    expect(
      host.container.querySelector(".tarot-reading-panel h2 .tarot-leaf"),
    ).toBeNull();
    expect(
      host.container.querySelectorAll(".tarot-reading-heading-card"),
    ).toHaveLength(0);
  } finally {
    await host.close();
  }
});
