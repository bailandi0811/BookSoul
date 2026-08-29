import { ReadingMode } from '@prisma/client';

export interface ReadingProgressState {
  mode: ReadingMode;
  currentSectionOrder: number | null;
}

export function calculateSpoilerCeiling(
  progress: ReadingProgressState,
  sectionCount: number,
  spoilerOverride = false,
): number {
  if (!Number.isSafeInteger(sectionCount) || sectionCount < 1) {
    throw new Error('Ready book must contain at least one section');
  }
  if (spoilerOverride) return sectionCount;

  switch (progress.mode) {
    case ReadingMode.NOT_STARTED:
      return 1;
    case ReadingMode.IN_PROGRESS:
      if (
        progress.currentSectionOrder === null ||
        progress.currentSectionOrder < 1 ||
        progress.currentSectionOrder > sectionCount
      ) {
        throw new Error('Reading progress section is inconsistent');
      }
      return progress.currentSectionOrder;
    case ReadingMode.FINISHED:
      return sectionCount;
  }
}
