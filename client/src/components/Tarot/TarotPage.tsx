import {
  Children,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowUpRight, Check, RotateCcw } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { ScenicBackground } from "@/components/ScenicBackground";
import { TAROT_DECK } from "@/lib/tarot-deck.generated";
import { getTarotSpread, TAROT_SPREADS } from "@/lib/tarot-spreads";
import { PAPER_EASE } from "@/lib/ui-motion";
import { useTarotRound } from "./useTarotRound";
import type { TarotCard } from "@/lib/tarot-types";
import "./tarot.css";

function Leaf({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`tarot-leaf ${className}`}
      viewBox="0 0 48 64"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 58C19 45 29 27 34 7"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M31 21C23 16 25 8 35 2c2 8 1 15-4 19ZM26 31C28 20 36 19 43 20c-3 8-8 11-17 11ZM20 41C12 37 13 27 18 23c5 7 6 12 2 18ZM16 47c4-10 12-11 20-8-5 7-12 9-20 8ZM10 56C4 51 5 44 7 40c5 5 7 11 3 16Z"
        fill="currentColor"
      />
    </svg>
  );
}
function Corners() {
  return (
    <div className="tarot-corners" aria-hidden="true">
      {[0, 1, 2, 3].map((corner) => (
        <svg
          key={corner}
          className={`tarot-corner corner-${corner}`}
          viewBox="0 0 36 36"
          fill="none"
        >
          <path
            d="M3 34V11q0-8 8-8h23M8 29V14q0-6 6-6h15M3 3c10 0 12 4 12 12C7 15 3 12 3 3ZM20 3c0 6-3 8-8 9M3 20c6 0 8-3 9-8"
            stroke="currentColor"
            strokeWidth=".8"
          />
        </svg>
      ))}
    </div>
  );
}
function Face({ card }: { card: TarotCard }) {
  const data = TAROT_DECK.find((item) => item.id === card.id)!;
  const [failed, setFailed] = useState(false);
  return (
    <div className="tarot-illustration">
      {failed ? (
        <span>{data.name}</span>
      ) : (
        <img
          src={`/tarot/${data.image}`}
          alt={`${data.name} · ${card.reversed ? "逆位" : "正位"}`}
          style={{ transform: card.reversed ? "rotate(180deg)" : undefined }}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

function headingText(children: ReactNode) {
  return Children.toArray(children)
    .map((child) => (typeof child === "string" ? child : ""))
    .join("")
    .trim();
}

function isMobileTarot() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 800px)").matches
  );
}
function useMobileTarot() {
  const [mobile, setMobile] = useState(isMobileTarot);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(max-width: 800px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return mobile;
}
function WaitingIllustration() {
  return (
    <div className="tarot-waiting-illustration" aria-hidden="true">
      {[-1, 0, 1].map((offset) => (
        <div className={`tarot-sketch-card sketch-${offset + 1}`} key={offset}>
          <Corners />
          <svg viewBox="0 0 60 85" fill="none">
            <circle cx="30" cy="30" r="13" />
            <path d="M30 9v42M9 30h42M17 17l26 26M43 17 17 43M30 18l3 9 9 3-9 3-3 9-3-9-9-3 9-3 3-9ZM14 59q8-5 16 0v16q-8-5-16 0zm16 0q8-5 16 0v16q-8-5-16 0" />
          </svg>
        </div>
      ))}
      <span className="sketch-spark spark-left">✧</span>
      <span className="sketch-spark spark-right">✧</span>
      <Leaf />
    </div>
  );
}
export function TarotPage({ onBack }: { onBack: () => void }) {
  const round = useTarotRound();
  const { state } = round;
  const mobile = useMobileTarot();
  const deckRef = useRef<HTMLDivElement>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(38);
  const reduced = useReducedMotion() === true;
  const definition = getTarotSpread(
    state.draw?.spread ?? state.classification?.spread ?? "three_card",
  );
  const required = definition.cardCountRequired;
  const working = ["classifying", "shuffling", "revealing", "reading"].includes(
    state.phase,
  );
  const full = !!state.draw && state.cards.length === required;
  const questionReady = state.classification !== null || state.draw !== null;
  const stage = !questionReady
    ? "question"
    : !state.draw
      ? "choose"
      : full
        ? "reading"
        : "drawing";
  const reset = () => round.reset();
  const statusValue =
    state.phase === "classifying"
      ? "正在整理问题"
      : state.phase === "shuffling"
        ? "正在洗牌"
        : state.draw
          ? full
            ? state.phase === "reading"
              ? "正在解读"
              : state.phase === "failed"
                ? "等待重试"
                : state.phase === "complete"
                  ? "解读完成"
                  : "已抽完"
            : "待抽取"
          : questionReady
            ? "选择牌阵"
            : "等待提问";

  const centerCard = (index: number, behavior: ScrollBehavior = "smooth") => {
    const deck = deckRef.current;
    const card = deck?.querySelector<HTMLElement>(
      `[data-card-index="${index}"]`,
    );
    if (!deck || !card) return;
    const left = card.offsetLeft - (deck.clientWidth - card.offsetWidth) / 2;
    if (typeof deck.scrollTo === "function")
      deck.scrollTo({ left, behavior: reduced ? "auto" : behavior });
    else deck.scrollLeft = left;
  };

  useEffect(() => {
    if (!state.draw || !mobile) return;
    const next = 38;
    setFocusedIndex(next);
    const frame = window.requestAnimationFrame(() => centerCard(next, "auto"));
    return () => window.cancelAnimationFrame(frame);
    // A new authoritative draw starts a fresh centered ribbon.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobile, state.draw?.readingId]);

  useEffect(() => {
    if (!state.draw || full || !mobile) return;
    const selected = new Set(state.cards.map((card) => card.index));
    if (!selected.has(focusedIndex)) return;
    let next = focusedIndex + 1;
    while (next < state.draw.cardCount && selected.has(next)) next += 1;
    if (next >= state.draw.cardCount) {
      next = focusedIndex - 1;
      while (next >= 0 && selected.has(next)) next -= 1;
    }
    if (next < 0 || next >= state.draw.cardCount) return;
    setFocusedIndex(next);
    const frame = window.requestAnimationFrame(() => centerCard(next));
    return () => window.cancelAnimationFrame(frame);
    // Drawn cards leave the active center so the next choice is actionable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobile, state.cards.length, state.draw?.readingId]);

  useEffect(
    () => () => {
      if (scrollFrameRef.current !== null)
        window.cancelAnimationFrame(scrollFrameRef.current);
    },
    [],
  );

  const updateFocusedCard = () => {
    if (!mobile || scrollFrameRef.current !== null) return;
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const deck = deckRef.current;
      if (!deck) return;
      const center = deck.getBoundingClientRect().left + deck.clientWidth / 2;
      let nearest = focusedIndex;
      let nearestDistance = Number.POSITIVE_INFINITY;
      deck
        .querySelectorAll<HTMLElement>("[data-card-index]")
        .forEach((card) => {
          const bounds = card.getBoundingClientRect();
          const distance = Math.abs(bounds.left + bounds.width / 2 - center);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = Number(card.dataset.cardIndex);
          }
        });
      if (nearest !== focusedIndex) setFocusedIndex(nearest);
    });
  };

  const ReadingSectionHeading = ({ children }: { children?: ReactNode }) => {
    const text = headingText(children);
    const positionIndex = definition.positions.findIndex(
      (position) => position.label === text,
    );
    const card = positionIndex >= 0 ? state.cards[positionIndex] : undefined;
    return (
      <h3 className="tarot-reading-section-heading">
        {card && (
          <span className="tarot-reading-heading-card" aria-hidden="true">
            <Face card={card} />
          </span>
        )}
        <span>{children}</span>
      </h3>
    );
  };
  return (
    <div className="tarot-page">
      <ScenicBackground />
      <AppHeader caption="塔罗小室" />
      <main className="tarot-shell">
        <button
          className="tarot-back"
          onClick={() => {
            reset();
            onBack();
          }}
        >
          <ArrowLeft size={18} />
          返回书库
        </button>
        <section className="tarot-intro">
          <div>
            <h1>
              塔罗小室 <Leaf />
            </h1>
            <p>给心里的问题，留一点想象。</p>
          </div>
          {(!mobile || questionReady) && (
            <button className="tarot-reset" onClick={reset}>
              <RotateCcw size={19} />
              重新占卜
            </button>
          )}
        </section>
        {(!mobile || questionReady) && (
          <motion.div
            className="tarot-question-bar"
            data-stage={stage}
            data-continuity="settled-question"
            layoutId={mobile ? "tarot-question-sheet" : undefined}
            initial={!mobile || reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: !mobile || reduced ? 0 : 0.24,
              ease: PAPER_EASE,
            }}
          >
            <span className="tarot-question-label">这次的问题</span>
            <p>
              {questionReady
                ? state.question
                : "把一个悬而未决的念头，写在这里。"}
            </p>
            <span className="tarot-round-status" role="status">
              {state.draw && (
                <span className="tarot-status-spread">
                  {definition.name}
                  <span aria-hidden="true"> · </span>
                </span>
              )}
              <span className="tarot-status-value">{statusValue}</span>
            </span>
          </motion.div>
        )}
        <div className="tarot-layout" data-stage={stage}>
          <div className="tarot-result-corners" aria-hidden="true">
            <Corners />
          </div>
          <section
            className="tarot-table"
            aria-label="塔罗牌桌"
            data-inactive={!state.draw}
            data-complete={full}
          >
            <Corners />
            <div
              className={`tarot-slot-row ${required === 1 ? "single-card" : ""}`}
            >
              {Array.from({ length: required }, (_, slot) => {
                const card = state.cards[slot];
                const data = card
                  ? TAROT_DECK.find((item) => item.id === card.id)
                  : null;
                return (
                  <div className="tarot-slot" key={slot}>
                    <div className="tarot-slot-label">
                      <span />
                      {definition.positions[slot].label}
                      <span />
                    </div>
                    <div className="tarot-flip-space">
                      <motion.div
                        className="tarot-flipper"
                        initial={false}
                        animate={{
                          rotateY: card ? 180 : 0,
                          scale: card && !reduced ? [1, 1.02, 1] : 1,
                        }}
                        transition={{
                          rotateY: {
                            duration: reduced ? 0 : 0.56,
                            ease: PAPER_EASE,
                          },
                          scale: {
                            duration: reduced ? 0 : 0.68,
                            times: [0, 0.82, 1],
                          },
                        }}
                      >
                        <div
                          className="tarot-slot-front"
                          data-active={!card && slot === state.cards.length}
                        >
                          <Corners />
                          <span className="tarot-slot-number">{slot + 1}</span>
                          <span>{["第一张", "第二张", "第三张"][slot]}</span>
                        </div>
                        <div className="tarot-slot-face">
                          {card && <Face card={card} />}
                        </div>
                      </motion.div>
                      {card && (
                        <motion.span
                          className="tarot-slot-check"
                          initial={reduced ? false : { scale: 0.5, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ duration: reduced ? 0 : 0.18 }}
                          aria-hidden="true"
                        >
                          <Check size={16} />
                        </motion.span>
                      )}
                    </div>
                    <div className="tarot-card-caption tarot-meanings">
                      {card && data && (
                        <>
                          <strong>{data.name}</strong>
                          <span>{card.reversed ? "逆位" : "正位"}</span>
                          <small>
                            {card.reversed ? data.reversed : data.upright}
                          </small>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {!state.cards.length && (
              <p className="tarot-placement-note">
                <span />
                选中的牌，会依次来到这里。
                <span />
              </p>
            )}
            {state.draw && !full && (
              <div className="tarot-mobile-selection" aria-live="polite">
                <span />
                <strong>
                  已选 {state.cards.length} / {required} 张
                </strong>
                <span />
              </div>
            )}
            {(!mobile || !full || state.phase === "failed") && (
              <div className="tarot-deck-well">
              <div
                className={`tarot-deck ${state.draw ? "is-ready" : ""}`}
                aria-label="78 张待抽卡牌，左右滑动选择"
                data-layout="orbit"
                ref={deckRef}
                onScroll={updateFocusedCard}
              >
                {[0, 1, 2].map((row) => (
                  <div className="tarot-arc" key={row}>
                    {Array.from({ length: 26 }, (_, column) => {
                      const index = row * 26 + column;
                      const selected = state.cards.some(
                        (card) => card.index === index,
                      );
                      const center = column - 12.5;
                      const orbitDistance = index - focusedIndex;
                      const displayedOrbitDistance = Math.max(
                        -4,
                        Math.min(4, orbitDistance),
                      );
                      if (selected && mobile) return null;
                      return (
                        <motion.button
                          type="button"
                          key={index}
                          className="tarot-card-back"
                          data-card-index={index}
                          data-focused={focusedIndex === index}
                          data-focus-distance={displayedOrbitDistance}
                          data-orbit-distance={displayedOrbitDistance}
                          data-orbit-visible={Math.abs(orbitDistance) <= 4}
                          style={{
                            left: `${(column / 25) * 93}%`,
                            top: `${25 - center * center * 0.15}px`,
                            rotate: `${-center * 0.95}deg`,
                            zIndex: selected ? 30 : column,
                          }}
                          disabled={
                            !state.draw ||
                            full ||
                            working ||
                            selected ||
                            state.pendingIndex !== null
                          }
                          aria-label={`选择第 ${index + 1} 张牌`}
                          aria-pressed={selected}
                          whileHover={
                            !reduced ? { y: -8, scale: 1.035 } : undefined
                          }
                          whileFocus={
                            !reduced ? { y: -8, scale: 1.035 } : undefined
                          }
                          transition={{
                            duration: reduced ? 0 : 0.18,
                            ease: PAPER_EASE,
                          }}
                          onFocus={() => {
                            if (!mobile) return;
                            setFocusedIndex(index);
                            centerCard(index);
                          }}
                          onClick={() => {
                            if (
                              mobile &&
                              focusedIndex !== index
                            ) {
                              setFocusedIndex(index);
                              centerCard(index);
                              return;
                            }
                            void round.reveal(index);
                          }}
                        >
                          <img src="/tarot/back.svg" alt="" />
                          <AnimatePresence>
                            {selected && (
                              <motion.span
                                className="tarot-selected"
                                initial={{ opacity: 0, scale: 0.7 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: reduced ? 0 : 0.18 }}
                              >
                                <Check size={24} />
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </motion.button>
                      );
                    })}
                  </div>
                ))}
              </div>
              </div>
            )}
            {state.draw && !full && (
              <p className="tarot-mobile-deck-guide">
                <span />
                左右滑动，点击中间的牌
                <span />
              </p>
            )}
            <p className="tarot-table-foot">
              {state.phase === "revealing"
                ? "正在翻开你的牌…"
                : full
                  ? "这一组牌，已经与你相遇。"
                  : state.draw
                    ? `从牌堆中，选出你的第${["一", "二", "三"][state.cards.length]}张牌。`
                    : "先写下问题，再让直觉带路。"}
            </p>
          </section>
          <aside className="tarot-paper" aria-label="提问与解读">
            <AnimatePresence mode="wait">
              <motion.div
                key={
                  !questionReady
                    ? "question"
                    : !state.draw
                      ? "choose"
                      : full
                        ? "reading"
                        : "waiting"
                }
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{
                  opacity: 0,
                  transition: { duration: reduced ? 0 : 0.14 },
                }}
                transition={{ duration: reduced ? 0 : 0.2, ease: PAPER_EASE }}
              >
                {!questionReady ? (
                  <motion.div
                    className="tarot-question-panel"
                    data-variant="prompt-sheet"
                    layoutId={mobile ? "tarot-question-sheet" : undefined}
                    transition={{
                      duration: reduced ? 0 : 0.24,
                      ease: PAPER_EASE,
                    }}
                  >
                    <Leaf />
                    <h2>
                      {mobile
                        ? "写下此刻最想知道的事"
                        : "今天，想问些什么？"}
                    </h2>
                    <p className="tarot-paper-subtitle">
                      {mobile
                        ? "不必组织得很完整，一句话就够。"
                        : "关于选择、关系，或一个悬而未决的念头。"}
                    </p>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (state.question.trim() && !working)
                          void round.submit(state.question);
                      }}
                    >
                      <label className="sr-only" htmlFor="tarot-question">
                        你的问题
                      </label>
                      <textarea
                        id="tarot-question"
                        placeholder={
                          mobile
                            ? "例如：这段关系接下来会怎样？"
                            : "最近，我在犹豫…"
                        }
                        rows={mobile ? 3 : 5}
                        value={state.question}
                        disabled={working}
                        onChange={(event) => {
                          if ([...event.target.value].length <= 300)
                            round.setQuestion(event.target.value);
                        }}
                      />
                      <div className="tarot-question-actions">
                        <span className="tarot-input-count">
                          {[...state.question].length} / 300
                        </span>
                        <button
                          className="tarot-primary"
                          type="submit"
                          data-ready={!!state.question.trim()}
                          disabled={!state.question.trim() || working}
                        >
                          {working
                            ? "正在整理心绪…"
                            : mobile
                              ? "让牌回应"
                              : "开始这一页"}
                          <ArrowUpRight size={17} />
                        </button>
                      </div>
                      {mobile ? (
                        <details className="tarot-disclosure">
                          <summary>问题仅用于选牌与解读</summary>
                          <p>
                            问题会发送给 TypeSafe
                            用于选择牌阵，并发送给当前聊天模型用于解读。请勿输入敏感信息。
                          </p>
                        </details>
                      ) : (
                        <p className="tarot-disclosure">
                          问题会发送给 TypeSafe
                          用于选择牌阵，并发送给当前聊天模型用于解读。请勿输入敏感信息。
                        </p>
                      )}
                    </form>
                  </motion.div>
                ) : !state.draw ? (
                  <>
                    <Leaf />
                    <h2>这一次，怎样看待它？</h2>
                    <p className="tarot-paper-subtitle">
                      {state.classification?.mode === "fixed"
                        ? "已为这一问选择牌阵。"
                        : state.classification?.reason === "unavailable"
                          ? "自动分类暂不可用，请选择想探索的方式。"
                          : "听听一个答案，看看时间的流向，或梳理眼前的阻碍。"}
                    </p>
                    <div className="tarot-choices">
                      {state.classification?.mode === "fixed" ? (
                        <button
                          disabled={working}
                          onClick={() =>
                            void round.choose(state.classification!.spread!)
                          }
                        >
                          <strong>
                            {working ? "正在洗牌…" : "重试原牌阵"}
                          </strong>
                          <span>
                            {required === 1 ? "一张" : "三张"} ·{" "}
                            {definition.name}
                          </span>
                        </button>
                      ) : (
                        TAROT_SPREADS.map((item) => (
                          <button
                            key={item.id}
                            disabled={working}
                            onClick={() => void round.choose(item.id)}
                          >
                            <strong>
                              {item.cardCountRequired === 1 ? "一张" : "三张"} ·{" "}
                              {item.name}
                            </strong>
                            <span>{item.description}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </>
                ) : !full ? (
                  <div className="tarot-waiting-panel">
                    <Leaf />
                    <h2>先选牌，再听回应</h2>
                    <span className="tarot-selection-count">
                      已选 {state.cards.length} / {required} 张
                    </span>
                    <WaitingIllustration />
                    <h3>
                      凭此刻的直觉，选出{required === 1 ? "一" : "三"}张牌。
                    </h3>
                    <p>
                      {required === 1
                        ? "点击一张牌，听听它与你的这一问相遇。"
                        : `点击顺序依次对应${definition.positions.map((p) => p.label).join("、")}。`}
                      <br />
                      全部翻开后，再一起看看它们的回应。
                    </p>
                    <div className="tarot-reflection">
                      <Leaf />
                      <div>
                        <strong>不必急着找到答案</strong>
                        <p>先把问题放在心里，让选择慢慢发生。</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="tarot-reading-panel">
                    <div className="tarot-reading-top">
                      <Leaf />
                      <span className="tarot-reading-status">
                        {state.phase === "reading"
                          ? "正在解读"
                          : state.phase === "failed"
                            ? "等待重试"
                            : "解读完成"}
                      </span>
                    </div>
                    <h2>
                      这一组牌，想对你说 {mobile && <Leaf />}
                    </h2>
                    <div
                      className="tarot-reading"
                      tabIndex={0}
                      aria-live="polite"
                      aria-busy={state.phase === "reading"}
                    >
                      {state.content ? (
                        <ReactMarkdown
                          skipHtml
                          disallowedElements={["img"]}
                          components={
                            mobile
                              ? {
                                  h1: ReadingSectionHeading,
                                  h2: ReadingSectionHeading,
                                  h3: ReadingSectionHeading,
                                  h4: ReadingSectionHeading,
                                  h5: ReadingSectionHeading,
                                  h6: ReadingSectionHeading,
                                  a: ({ children, href }) => (
                                    <a
                                      href={href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      {children}
                                    </a>
                                  ),
                                }
                              : {
                                  a: ({ children, href }) => (
                                    <a
                                      href={href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      {children}
                                    </a>
                                  ),
                                }
                          }
                        >
                          {state.content}
                        </ReactMarkdown>
                      ) : (
                        <p className="tarot-waiting">
                          让零散的思绪，慢慢成为文字。
                        </p>
                      )}
                    </div>
                    {state.phase === "complete" && (
                      <div className="tarot-reflection">
                        <Leaf />
                        <div>
                          <strong>留给自己的一个问题</strong>
                          <p>读完这些回应，此刻你最想对自己说什么？</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {state.error && (
                  <div className="tarot-error" role="alert">
                    <p>{state.error}</p>
                    {full ? (
                      <button
                        disabled={working}
                        onClick={() => void round.retryReading()}
                      >
                        用这些牌重新解读
                      </button>
                    ) : state.pendingIndex !== null ? (
                      <button
                        disabled={working}
                        onClick={() => void round.reveal(state.pendingIndex!)}
                      >
                        重试揭晓这张牌
                      </button>
                    ) : state.draw ? (
                      <button onClick={reset}>重新开始</button>
                    ) : null}
                  </div>
                )}
                <footer className="tarot-paper-footer">
                  <Leaf />
                  这一次，只属于此刻。
                </footer>
              </motion.div>
            </AnimatePresence>
          </aside>
        </div>
        {(!mobile || questionReady) && (
          <p className="tarot-bottom-note">
            仅供娱乐与自我整理，不构成医疗、法律或财务建议。
          </p>
        )}
      </main>
    </div>
  );
}
