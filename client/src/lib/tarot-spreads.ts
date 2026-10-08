import { TAROT_SPREADS, type TarotSpread } from "./tarot-spreads.generated";
export { TAROT_SPREADS } from "./tarot-spreads.generated";
export function getTarotSpread(spread: TarotSpread) {
  const definition = TAROT_SPREADS.find((item) => item.id === spread);
  if (!definition) throw new Error("TAROT_INVALID_RESPONSE");
  return definition;
}
