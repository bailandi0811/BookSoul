import type { TarotSpread, TarotPosition } from "./tarot-spreads.generated";
export type { TarotSpread, TarotPosition } from "./tarot-spreads.generated";
export interface TarotClassification {
  mode: "fixed" | "choose";
  spread: TarotSpread | null;
  reason: "low_confidence" | "unclear" | "unavailable" | null;
  permit: string;
}
export interface TarotDraw {
  readingId: string;
  spread: TarotSpread;
  expiresAt: number;
  cardCount: 78;
}
export interface TarotCard {
  id: string;
  reversed: boolean;
  position: TarotPosition;
}
export interface TarotReveal {
  revealedCount: number;
  cardCountRequired: number;
  card: TarotCard;
}
