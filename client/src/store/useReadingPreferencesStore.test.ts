import { describe, expect, it } from "vitest";
import { useReadingPreferencesStore } from "./useReadingPreferencesStore";
describe("reader preferences", () => {
  it("has comfortable defaults and rejects invalid sizes", () => {
    expect(useReadingPreferencesStore.getState()).toMatchObject({ fontSizePx: 20, lineHeight: 1.9, widthPx: 640 });
    useReadingPreferencesStore.getState().setPreference("fontSizePx", 99);
    expect(useReadingPreferencesStore.getState().fontSizePx).toBe(20);
    useReadingPreferencesStore.getState().setPreference("fontSizePx", 28);
    expect(useReadingPreferencesStore.getState().fontSizePx).toBe(28);
    expect(Object.keys(JSON.parse(localStorage.getItem("booksoul_reading_preferences")!))).toEqual(["fontSizePx", "lineHeight", "widthPx"]);
  });
});
