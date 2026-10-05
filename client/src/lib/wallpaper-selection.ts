export type WallpaperRef = { kind: "SYSTEM" | "USER"; id: string };

export function chooseRandomWallpaper(
  candidates: WallpaperRef[],
  previous: WallpaperRef | null,
  random: () => number,
): WallpaperRef | null {
  if (!candidates.length) return null;
  const alternatives = candidates.filter(
    (item) => item.kind !== previous?.kind || item.id !== previous.id,
  );
  const pool = alternatives.length ? alternatives : candidates;
  return pool[Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)))];
}
