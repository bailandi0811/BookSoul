import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { getTarotSpread } from "@/lib/tarot-spreads";
import {
  classifyTarot,
  drawTarot,
  revealTarot,
  streamTarotReading,
  tarotErrorText,
} from "@/lib/tarot-api";
import type {
  TarotCard,
  TarotClassification,
  TarotDraw,
  TarotSpread,
} from "@/lib/tarot-types";

type Phase =
  | "question"
  | "classifying"
  | "choose"
  | "shuffling"
  | "drawing"
  | "revealing"
  | "reading"
  | "complete"
  | "failed";
interface State {
  phase: Phase;
  question: string;
  classification: TarotClassification | null;
  draw: TarotDraw | null;
  cards: (TarotCard & { index: number })[];
  content: string;
  error: string | null;
  pendingIndex: number | null;
}
const initial = (): State => ({
  phase: "question",
  question: "",
  classification: null,
  draw: null,
  cards: [],
  content: "",
  error: null,
  pendingIndex: null,
});
export function useTarotRound() {
  const [state, setState] = useState<State>(initial);
  const current = useRef(state);
  const operation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const update = (patch: Partial<State>) => {
    current.current = { ...current.current, ...patch };
    setState(current.current);
  };
  const reset = () => {
    operation.current++;
    controller.current?.abort();
    controller.current = null;
    busy.current = false;
    current.current = initial();
    setState(current.current);
  };
  useEffect(() => {
    const operations = operation;
    const unsubscribe = useAuthStore.subscribe((next, previous) => {
      if (
        next.authGeneration !== previous.authGeneration ||
        next.user?.id !== previous.user?.id ||
        next.isAuthenticated !== previous.isAuthenticated
      )
        reset();
    });
    const leave = () => {
      if (window.location.hash !== "#tarot") reset();
    };
    window.addEventListener("hashchange", leave);
    return () => {
      unsubscribe();
      window.removeEventListener("hashchange", leave);
      operations.current++;
      controller.current?.abort();
    };
  }, []);
  const start = () => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const sequence = ++operation.current;
    busy.current = true;
    return {
      signal: abort.signal,
      valid: () => operation.current === sequence && !abort.signal.aborted,
    };
  };
  const wash = async (
    permit: string,
    selected: TarotSpread,
    run: ReturnType<typeof start>,
  ) => {
    update({ phase: "shuffling", error: null });
    const draw = await drawTarot(permit, selected, run.signal);
    if (run.valid()) update({ draw, phase: "drawing" });
  };
  const read = async (readingId: string, run: ReturnType<typeof start>) => {
    update({ phase: "reading", content: "", error: null });
    await streamTarotReading(readingId, run.signal, (text) => {
      if (run.valid()) update({ content: current.current.content + text });
    });
    if (run.valid()) update({ phase: "complete" });
  };
  const execute = async (
    work: (run: ReturnType<typeof start>) => Promise<void>,
  ) => {
    if (busy.current) return;
    const run = start();
    try {
      await work(run);
    } catch (error) {
      if (run.valid())
        update({ phase: "failed", error: tarotErrorText(error) });
    } finally {
      if (run.valid()) busy.current = false;
    }
  };
  const submit = async (question: string) => {
    reset();
    const normalized = question.normalize("NFC").trim();
    await execute(async (run) => {
      update({ question: normalized, phase: "classifying" });
      const classification = await classifyTarot(normalized, run.signal);
      if (!run.valid()) return;
      update({ classification });
      if (classification.mode === "fixed" && classification.spread)
        await wash(classification.permit, classification.spread, run);
      else update({ phase: "choose" });
    });
  };
  const choose = async (selected: TarotSpread) => {
    const classification = current.current.classification;
    if (!classification || current.current.draw) return;
    await execute((run) => wash(classification.permit, selected, run));
  };
  const reveal = async (index: number) => {
    const snapshot = current.current;
    const draw = snapshot.draw;
    if (
      !draw ||
      (snapshot.pendingIndex !== null && snapshot.pendingIndex !== index) ||
      snapshot.cards.some((card) => card.index === index) ||
      snapshot.cards.length >= getTarotSpread(draw.spread).cardCountRequired
    )
      return;
    await execute(async (run) => {
      update({ phase: "revealing", pendingIndex: index, error: null });
      const revealed = await revealTarot(draw.readingId, index, run.signal);
      if (!run.valid()) return;
      const definition = getTarotSpread(draw.spread);
      const expected = definition.cardCountRequired;
      const position = definition.positions[snapshot.cards.length].id;
      if (
        revealed.cardCountRequired !== expected ||
        revealed.revealedCount !== snapshot.cards.length + 1 ||
        revealed.card.position !== position
      )
        throw new Error("Invalid reveal sequence");
      update({
        cards: [...snapshot.cards, { ...revealed.card, index }],
        pendingIndex: null,
        phase: "drawing",
      });
      if (revealed.revealedCount === expected) await read(draw.readingId, run);
    });
  };
  const retryReading = async () => {
    const draw = current.current.draw;
    if (
      draw &&
      current.current.cards.length ===
        getTarotSpread(draw.spread).cardCountRequired
    )
      await execute((run) => read(draw.readingId, run));
  };
  return {
    state,
    setQuestion: (question: string) => update({ question }),
    submit,
    choose,
    reveal,
    retryReading,
    reset,
  };
}
