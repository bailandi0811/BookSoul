export function useTarotRound() {
  return {
    state: {
      phase: "complete" as const,
      question: "我们接下来会怎样？",
      classification: {
        mode: "fixed" as const,
        spread: "three_card" as const,
        reason: null,
        permit: "preview",
      },
      draw: {
        readingId: "preview",
        spread: "three_card" as const,
        expiresAt: 9999999999,
        cardCount: 78,
      },
      cards: [
        { id: "major-00", reversed: false, position: "past", index: 22 },
        { id: "cups-02", reversed: false, position: "present", index: 39 },
        { id: "major-19", reversed: false, position: "future", index: 57 },
      ],
      content:
        "## 整体倾向\n这是一段从新的开始，走向更深连接、最终迎来明朗与成长的旅程。\n\n## 过去\n你带着好奇与勇气迈出第一步，愿意尝试新的可能。\n\n## 现在\n彼此的真诚与理解正在建立，关系进入更深的连接阶段。\n\n## 未来\n未来充满光明与希望，关系有望走向更稳定而积极的发展。\n\n## 可以尝试\n保持开放的心，继续真诚地交流。",
      error: null,
      pendingIndex: null,
    },
    reset: () => undefined,
    setQuestion: () => undefined,
    submit: async () => undefined,
    choose: async () => undefined,
    reveal: async () => undefined,
    retryReading: async () => undefined,
  };
}
