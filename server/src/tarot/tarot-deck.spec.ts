import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { TAROT_DECK } from './tarot-deck.generated';

describe('local tarot deck', () => {
  it('bundles a complete original-meaning deck and matching client data', () => {
    expect(TAROT_DECK).toHaveLength(78);
    expect(new Set(TAROT_DECK.map((card) => card.id)).size).toBe(78);
    expect(TAROT_DECK.filter((card) => card.arcana === 'major')).toHaveLength(
      22,
    );
    for (const suit of ['wands', 'cups', 'swords', 'pentacles']) {
      expect(TAROT_DECK.filter((card) => card.suit === suit)).toHaveLength(14);
    }
    const root = resolve(__dirname, '../../..');
    expect(
      JSON.parse(readFileSync(resolve(root, 'shared/tarot/deck.json'), 'utf8')),
    ).toEqual(TAROT_DECK);
    for (const card of TAROT_DECK) {
      for (const meaning of [card.upright, card.reversed]) {
        expect(Array.from(meaning).length).toBeGreaterThan(0);
        expect(Array.from(meaning).length).toBeLessThanOrEqual(40);
      }
      const image = readFileSync(
        resolve(root, 'client/public/tarot', card.image),
      );
      expect(image.subarray(0, 3).toString('hex')).toBe('ffd8ff');
    }
    const client = readFileSync(
      resolve(root, 'client/src/lib/tarot-deck.generated.ts'),
      'utf8',
    );
    expect(client).toBe(
      readFileSync(resolve(__dirname, 'tarot-deck.generated.ts'), 'utf8'),
    );
    expect(existsSync(resolve(root, 'client/public/tarot/back.svg'))).toBe(
      true,
    );
  });
});
