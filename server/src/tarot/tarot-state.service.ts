import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { randomBytes, randomInt } from 'node:crypto';
import { TAROT_DECK } from './tarot-deck.generated';
import { positions, tarotError } from './tarot.policy';
import type {
  DrawnCard,
  TarotReadingInput,
  TarotAction,
  TarotClassification,
  TarotDraw,
  TarotReveal,
  TarotRun,
  TarotSpread,
} from './tarot.types';

type Round = TarotDraw & {
  cards: DrawnCard[];
  revealed: number[];
  question: string;
};
type State = {
  permit: string;
  permitExpires: number;
  question: string;
  result: TarotClassification;
  round?: Round;
};
type Run = {
  id: string;
  owner: string;
  controller: AbortController;
  stage: 'classification' | 'reading';
  readingId?: string;
};
const WINDOW = 10 * 60_000;
const LIMITS = { classification: 10, draw: 10, reveal: 30, reading: 10 };
const randomId = () => randomBytes(16).toString('hex');

@Injectable()
export class TarotStateService implements OnModuleInit, OnModuleDestroy {
  private readonly states = new Map<string, State>();
  private readonly runs = new Map<string, Run>();
  private readonly pending = new Set<string>();
  private readonly rates = new Map<string, number[]>();
  private timer?: ReturnType<typeof setInterval>;

  onModuleInit() {
    this.timer = setInterval(() => this.clean(), 60_000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    for (const run of this.runs.values()) run.controller.abort();
    this.states.clear();
    this.pending.clear();
    this.rates.clear();
  }
  private clean() {
    const now = Date.now();
    for (const [owner, state] of this.states) {
      if (
        state.round
          ? state.round.expiresAt * 1000 <= now
          : state.permitExpires <= now
      )
        this.invalidate(owner);
    }
    for (const [key, times] of this.rates) {
      const current = times.filter((time) => time > now - WINDOW);
      if (current.length) this.rates.set(key, current);
      else this.rates.delete(key);
    }
  }
  count(owner: string, action: TarotAction) {
    const now = Date.now();
    const key = `${owner}:${action}`;
    const times = (this.rates.get(key) ?? []).filter(
      (time) => time > now - WINDOW,
    );
    if (times.length >= LIMITS[action])
      throw tarotError(
        429,
        'TAROT_RATE_LIMITED',
        Math.max(1, Math.ceil((times[0] + WINDOW - now) / 1000)),
      );
    this.rates.set(key, [...times, now]);
  }
  invalidate(owner: string) {
    this.states.delete(owner);
    this.runs.get(owner)?.controller.abort();
  }
  private capacity(owner: string) {
    this.clean();
    if (
      !this.states.has(owner) &&
      !this.pending.has(owner) &&
      new Set([...this.states.keys(), ...this.pending]).size >= 1000
    )
      throw tarotError(429, 'TAROT_CAPACITY_EXCEEDED', 60);
  }
  createPermit(
    owner: string,
    question: string,
    result: TarotClassification,
  ): string {
    this.capacity(owner);
    const permit = randomId();
    this.states.set(owner, {
      permit,
      permitExpires: Date.now() + WINDOW,
      question,
      result,
    });
    return permit;
  }
  draw(owner: string, permit: string, spread: TarotSpread): TarotDraw {
    this.clean();
    const state = this.states.get(owner);
    if (!state || state.permit !== permit || state.permitExpires <= Date.now())
      throw tarotError(400, 'TAROT_PERMIT_INVALID');
    if (
      (state.result.mode === 'fixed' && state.result.spread !== spread) ||
      (state.round && state.round.spread !== spread)
    )
      throw tarotError(409, 'TAROT_SPREAD_LOCKED');
    if (!state.round) {
      const cards = TAROT_DECK.map((card) => ({
        id: card.id,
        reversed: randomInt(0, 2) === 1,
      }));
      for (let i = cards.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [cards[i], cards[j]] = [cards[j], cards[i]];
      }
      state.round = {
        cards,
        revealed: [],
        question: state.question,
        spread,
        readingId: randomId(),
        cardCount: 78,
        expiresAt: Math.floor(Date.now() / 1000) + 30 * 60,
      };
    }
    const { readingId, cardCount, expiresAt } = state.round;
    return { readingId, spread, cardCount, expiresAt };
  }
  getRound(owner: string, readingId: string): Round {
    this.clean();
    const round = this.states.get(owner)?.round;
    if (!round || round.readingId !== readingId)
      throw tarotError(400, 'TAROT_DRAW_INVALID');
    return round;
  }
  reveal(owner: string, readingId: string, index: number): TarotReveal {
    const round = this.getRound(owner, readingId);
    if (!Number.isInteger(index) || index < 0 || index >= 78)
      throw tarotError(400, 'TAROT_DRAW_INVALID');
    const slots = positions(round.spread);
    let order = round.revealed.indexOf(index);
    if (order < 0 && round.revealed.length >= slots.length)
      throw tarotError(409, 'TAROT_REVEAL_COMPLETE');
    const card = round.cards[index];
    if (!TAROT_DECK.some((item) => item.id === card.id))
      throw tarotError(500, 'TAROT_DECK_INVALID');
    // No await between checking the ceiling and appending: one authoritative sequence.
    if (order < 0) {
      order = round.revealed.length;
      round.revealed.push(index);
    }
    return {
      card: { ...card, position: slots[order] },
      revealedCount: round.revealed.length,
      cardCountRequired: slots.length,
    };
  }
  getReading(owner: string, readingId: string): TarotReadingInput {
    const round = this.getRound(owner, readingId);
    const slots = positions(round.spread);
    if (round.revealed.length !== slots.length)
      throw tarotError(409, 'TAROT_READING_INCOMPLETE');
    const cards = round.revealed.map((index, i) => ({
      ...round.cards[index],
      position: slots[i],
    }));
    if (cards.some((card) => !TAROT_DECK.some((data) => data.id === card.id)))
      throw tarotError(500, 'TAROT_DECK_INVALID');
    return { question: round.question, spread: round.spread, cards };
  }
  beginRun(
    owner: string,
    stage: 'classification' | 'reading',
    readingId?: string,
  ): TarotRun {
    if (stage === 'reading' && readingId) this.getReading(owner, readingId);
    const previous = this.runs.get(owner);
    if (
      previous?.stage === 'reading' &&
      previous.readingId === readingId &&
      stage === 'reading'
    )
      throw tarotError(409, 'TAROT_READING_BUSY');
    if (previous || this.runs.size >= 20)
      throw tarotError(429, 'TAROT_CONCURRENCY_LIMITED', 5);
    this.capacity(owner);
    const run = {
      id: randomId(),
      owner,
      controller: new AbortController(),
      stage,
      readingId,
    };
    this.runs.set(owner, run);
    if (stage === 'classification') this.pending.add(owner);
    return {
      id: run.id,
      signal: run.controller.signal,
      release: () => {
        if (this.runs.get(owner)?.id !== run.id) return;
        this.runs.delete(owner);
        this.pending.delete(owner);
      },
    };
  }
  isCurrentRun(owner: string, id: string) {
    return (
      this.runs.get(owner)?.id === id &&
      !this.runs.get(owner)?.controller.signal.aborted
    );
  }
}
