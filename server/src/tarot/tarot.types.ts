import type { TarotSpread, TarotPosition } from './tarot-spreads.generated';
export type { TarotSpread, TarotPosition } from './tarot-spreads.generated';
export type TarotAction = 'classification' | 'draw' | 'reveal' | 'reading';
export type TarotClassification = {
  mode: 'fixed' | 'choose';
  spread: TarotSpread | null;
  reason: 'low_confidence' | 'unclear' | 'unavailable' | null;
};
export type DrawnCard = { id: string; reversed: boolean };
export type RevealedCard = DrawnCard & { position: TarotPosition };
export type TarotReadingInput = {
  question: string;
  spread: TarotSpread;
  cards: RevealedCard[];
};
export type TarotDraw = {
  spread: TarotSpread;
  cardCount: number;
  expiresAt: number;
  readingId: string;
};
export type TarotReveal = {
  revealedCount: number;
  cardCountRequired: number;
  card: RevealedCard;
};
export type TarotRun = { id: string; signal: AbortSignal; release: () => void };
