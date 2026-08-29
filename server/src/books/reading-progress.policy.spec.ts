import { ReadingMode } from '@prisma/client';
import { calculateSpoilerCeiling } from './reading-progress.policy';

describe('calculateSpoilerCeiling', () => {
  it.each([
    [ReadingMode.NOT_STARTED, null, 1],
    [ReadingMode.IN_PROGRESS, 3, 3],
    [ReadingMode.FINISHED, 5, 5],
  ])(
    'maps %s progress to its allowed section ceiling',
    (mode, current, expected) => {
      expect(
        calculateSpoilerCeiling({ mode, currentSectionOrder: current }, 5),
      ).toBe(expected);
    },
  );

  it('uses a request-only override without changing the supplied state', () => {
    const progress = {
      mode: ReadingMode.NOT_STARTED,
      currentSectionOrder: null,
    };
    expect(calculateSpoilerCeiling(progress, 5, true)).toBe(5);
    expect(progress).toEqual({
      mode: ReadingMode.NOT_STARTED,
      currentSectionOrder: null,
    });
  });

  it('fails closed for inconsistent persisted progress', () => {
    expect(() =>
      calculateSpoilerCeiling(
        { mode: ReadingMode.IN_PROGRESS, currentSectionOrder: 9 },
        5,
      ),
    ).toThrow('Reading progress section is inconsistent');
  });
});
