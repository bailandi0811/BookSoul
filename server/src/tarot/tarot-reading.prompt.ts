import { TAROT_DECK } from './tarot-deck.generated';
import { positions, getTarotSpread, tarotError } from './tarot.policy';
import {
  loadTarotReadingSkill,
  TAROT_READING_SKILL_METADATA,
} from '../agent-skills/tarot-agent-skills';
import type { TarotReadingInput } from './tarot.types';

export const TAROT_READING_PROMPT_VERSION =
  TAROT_READING_SKILL_METADATA.version;

type ReadingMessages = [
  { role: 'system'; content: string },
  { role: 'user'; content: string },
];

export function buildTarotReadingMessages(
  input: TarotReadingInput,
): ReadingMessages {
  if (
    !input ||
    typeof input.question !== 'string' ||
    !input.question.trim() ||
    Array.from(input.question).length > 300 ||
    !Array.isArray(input.cards)
  ) {
    throw tarotError(500, 'TAROT_DECK_INVALID');
  }
  const definition = getTarotSpread(input.spread);
  const slots = positions(input.spread);
  if (input.cards.length !== slots.length)
    throw tarotError(500, 'TAROT_DECK_INVALID');
  const seen = new Set<string>();
  const cards = Array.from(input.cards).map((card, index) => {
    if (
      !card ||
      card.position !== slots[index] ||
      typeof card.reversed !== 'boolean' ||
      seen.has(card.id)
    )
      throw tarotError(500, 'TAROT_DECK_INVALID');
    const data = TAROT_DECK.find((item) => item.id === card.id);
    if (!data) throw tarotError(500, 'TAROT_DECK_INVALID');
    seen.add(card.id);
    return {
      id: data.id,
      position: card.position,
      reversed: card.reversed,
      name: data.name,
      meaning: card.reversed ? data.reversed : data.upright,
    };
  });
  const skill = loadTarotReadingSkill(input.spread);
  return [
    {
      role: 'system',
      content: skill.content,
    },
    {
      role: 'user',
      content: JSON.stringify({
        spread: input.spread,
        spreadDefinition: definition,
        cardCount: cards.length,
        untrustedQuestion: input.question,
        cards,
      }),
    },
  ];
}
