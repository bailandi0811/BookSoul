import {
  assertMediaInput,
  assertWallpaperSelection,
  normalizeProfileName,
} from './profile.policy';

describe('profile input policy', () => {
  it('trims names and enforces Unicode length and control character limits', () => {
    expect(normalizeProfileName('  Reader  ')).toBe('Reader');
    expect(normalizeProfileName('书'.repeat(50))).toHaveLength(50);
    expect(normalizeProfileName('😀'.repeat(50))).toBe('😀'.repeat(50));
    for (const value of ['', '  ', '书'.repeat(51), 'a\nname', 123]) {
      expect(() => normalizeProfileName(value)).toThrow();
    }
  });
  it('accepts purpose size boundaries and chooses a safe extension', () => {
    expect(assertMediaInput('AVATAR', 'image/jpeg', 5 * 1024 ** 2)).toEqual({
      purpose: 'AVATAR',
      contentType: 'image/jpeg',
      byteSize: 5242880,
      extension: 'jpg',
    });
    expect(
      assertMediaInput('WALLPAPER', 'image/webp', 10 * 1024 ** 2).byteSize,
    ).toBe(10485760);
    for (const bytes of [0, -1, 1.5, 5242881, NaN])
      expect(() => assertMediaInput('AVATAR', 'image/png', bytes)).toThrow();
    expect(() => assertMediaInput('AVATAR', 'image/svg+xml', 30)).toThrow();
    expect(() => assertMediaInput('BOOK', 'image/png', 30)).toThrow();
  });
  it('rejects contradictory or unknown wallpaper choices', () => {
    expect(assertWallpaperSelection({ mode: 'RANDOM' })).toEqual({
      mode: 'RANDOM',
    });
    expect(
      assertWallpaperSelection({ mode: 'FIXED', kind: 'SYSTEM', id: 'none' }),
    ).toEqual({ mode: 'FIXED', kind: 'SYSTEM', id: 'none' });
    for (const input of [
      { mode: 'RANDOM', id: 'city' },
      { mode: 'FIXED', kind: 'SYSTEM', id: 'other' },
      { mode: 'FIXED', kind: 'USER', id: '../other' },
      null,
    ])
      expect(() => assertWallpaperSelection(input)).toThrow();
  });
});
