import { create } from "zustand";
type Preferences = { fontSizePx: number; lineHeight: number; widthPx: number };
const defaults: Preferences = { fontSizePx: 20, lineHeight: 1.9, widthPx: 640 };
const ranges = { fontSizePx: [16, 28], lineHeight: [1.6, 2.2], widthPx: [480, 800] };
const key = "booksoul_reading_preferences";
function valid(name: keyof Preferences, value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= ranges[name][0] && value <= ranges[name][1];
}
function read(): Preferences {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (typeof data !== "object" || data === null) return defaults;
    const result = { ...defaults };
    for (const name of Object.keys(defaults) as (keyof Preferences)[]) if (name in data && valid(name, data[name as keyof typeof data])) result[name] = data[name as keyof typeof data];
    return result;
  } catch { return defaults; }
}
export const useReadingPreferencesStore = create<Preferences & { setPreference: (name: keyof Preferences, value: number) => void }>((set, get) => ({
  ...read(),
  setPreference: (name, value) => {
    if (!valid(name, value)) return;
    set({ [name]: value });
    const { fontSizePx, lineHeight, widthPx } = get();
    try { localStorage.setItem(key, JSON.stringify({ fontSizePx, lineHeight, widthPx })); } catch { /* Layout remains usable when browser storage is unavailable. */ }
  },
}));
