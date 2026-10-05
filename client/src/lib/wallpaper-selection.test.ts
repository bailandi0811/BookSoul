import { expect, it } from "vitest";
import { chooseRandomWallpaper, type WallpaperRef } from "./wallpaper-selection";

it("handles empty and single candidates and avoids the previous image when possible", () => {
  const system: WallpaperRef = { kind: "SYSTEM", id: "city" };
  const owned: WallpaperRef = { kind: "USER", id: "owned-ready" };
  expect(chooseRandomWallpaper([], system, () => 0)).toBeNull();
  expect(chooseRandomWallpaper([system], system, () => 0)).toEqual(system);
  expect(chooseRandomWallpaper([system, owned], system, () => 0)).toEqual(owned);
  expect(chooseRandomWallpaper([system, owned], owned, () => 0)).toEqual(system);
  expect(chooseRandomWallpaper([system, owned], null, () => 0.75)).toEqual(owned);
});
