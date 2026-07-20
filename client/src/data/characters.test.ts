import { describe, it, expect } from 'vitest';
import { CHARACTERS, getCharacter, CHARACTER_IDS } from './characters';

describe('characters', () => {
  it('exposes four character ids matching backend CharacterType', () => {
    expect(CHARACTER_IDS).toEqual(['assistant', 'qiaofeng', 'duanyu', 'wangyuyan']);
  });

  it('every character has required immersion fields', () => {
    for (const id of CHARACTER_IDS) {
      const c = getCharacter(id);
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.shortTitle.length).toBeGreaterThan(0);
      expect(c.sealChar.length).toBe(1);
      expect(c.waitingText.length).toBeGreaterThan(0);
      expect(c.placeholder.length).toBeGreaterThan(0);
      expect(c.greeting.length).toBeGreaterThan(0);
      expect(c.suggestions.length).toBeGreaterThanOrEqual(2);
      expect(c.suggestions.length).toBeLessThanOrEqual(3);
      expect(c.accentCssVar).toMatch(/^--char-/);
    }
  });

  it('keeps email demo out of empty-state suggestions', () => {
    for (const id of CHARACTER_IDS) {
      for (const s of getCharacter(id).suggestions) {
        expect(s).not.toMatch(/@/);
      }
    }
  });
});
