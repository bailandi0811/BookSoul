import { create } from "zustand";
import { chooseRandomWallpaper, type WallpaperRef } from "@/lib/wallpaper-selection";
import type { ProfileSnapshot, WallpaperSelection } from "@/lib/user-profile-api";

export const BACKGROUNDS = [
  { id: "none", name: "纯色纸面", image: null, credit: null },
  {
    id: "mountains",
    name: "雪山静湖",
    image: "winter.webp",
    credit: "https://unsplash.com/photos/KeyU8hT30wo",
  },
  {
    id: "city",
    name: "夜色东京",
    image: "city.webp",
    credit: "https://unsplash.com/photos/qAwkxkU1Xso",
  },
  {
    id: "anime",
    name: "海上列车",
    image: "anime-43.jpg",
    credit: "https://www.ghibli.jp/works/chihiro/",
  },
  {
    id: "dunes",
    name: "暮光沙丘",
    image: "dunes.webp",
    credit: "https://unsplash.com/photos/_0GU6g_3-xE",
  },
  {
    id: "rain-city",
    name: "雨夜街灯",
    image: "rain-city.webp",
    credit: "https://unsplash.com/photos/uZA3P4sA3tM",
  },
  {
    id: "anime-town",
    name: "风中的小镇",
    image: "anime-town.jpg",
    credit: "https://www.ghibli.jp/works/chihiro/",
  },
  {
    id: "coast",
    name: "落日海岸",
    image: "coast.webp",
    credit: "https://unsplash.com/photos/y7XgyrbFw0Y",
  },
] as const;
export type BackgroundId = (typeof BACKGROUNDS)[number]["id"];
export type Theme = "light" | "dark";

function readPreference(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function savePreference(key: string, value: string) {
  // Private browsing may deny storage; the current page should remain usable.
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Keep this session's choice. */
  }
}
const savedTheme = readPreference("booksoul_theme");
const savedBackground = readPreference("booksoul_background");
const savedGuestFixed = readPreference("booksoul_guest_fixed");
const guestFixed = BACKGROUNDS.find(scene => scene.id === savedGuestFixed)?.id;
// Pick once at page entry, so route changes and streaming never change the view.
// Exclude the last wallpaper to avoid an immediate repeat on refresh.
const entryBackgrounds = BACKGROUNDS.filter(
  (scene) => scene.image && scene.id !== savedBackground,
);
const entryBackground =
  guestFixed ?? entryBackgrounds[Math.floor(Math.random() * entryBackgrounds.length)].id;
savePreference("booksoul_background", entryBackground);
const initialTheme: Theme =
  savedTheme === "light" || savedTheme === "dark"
    ? savedTheme
    : typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";

export const useAppearanceStore = create<{
  theme: Theme;
  background: string;
  selection: WallpaperRef | null;
  wallpaper: WallpaperSelection;
  scope: string;
  prepareProfile: (scope: string | null) => void;
  applyProfile: (profile: ProfileSnapshot) => void;
  setGuestMode: (mode: "RANDOM" | "FIXED") => void;
  setTheme: (theme: Theme) => void;
  setBackground: (background: BackgroundId) => void;
}>((set, get) => ({
  theme: initialTheme,
  background: entryBackground,
  selection: { kind: "SYSTEM", id: entryBackground },
  wallpaper: guestFixed ? { mode: "FIXED", kind: "SYSTEM", id: guestFixed } : { mode: "RANDOM" },
  scope: "guest",
  prepareProfile: (scope) => {
    if (scope) set({ scope, selection: null, background: "none", wallpaper: { mode: "RANDOM" } });
    else {
      const saved = readPreference("booksoul_guest_fixed");
      const fixed = BACKGROUNDS.some(item => item.id === saved) ? saved as BackgroundId : null;
      const selected = fixed ? { kind: "SYSTEM" as const, id: fixed } : randomSelection("guest", systemCandidates());
      set({ scope: "guest", selection: selected, background: selected?.id ?? "none", wallpaper: fixed ? { mode: "FIXED", ...selected! } : { mode: "RANDOM" } });
    }
  },
  applyProfile: (profile) => {
    const current = get();
    const candidates: WallpaperRef[] = [...systemCandidates(), ...profile.wallpapers.map(item => ({ kind: "USER" as const, id: item.id }))];
    const retain = current.selection && candidates.some(item => item.kind === current.selection?.kind && item.id === current.selection.id);
    const selection = profile.wallpaper.mode === "FIXED"
      ? { kind: profile.wallpaper.kind, id: profile.wallpaper.id }
      : current.wallpaper.mode === "RANDOM" && retain ? current.selection : randomSelection(current.scope, candidates, current.selection);
    set({ wallpaper: profile.wallpaper, selection, background: selection?.id ?? "none" });
  },
  setGuestMode: (mode) => {
    if (get().scope !== "guest" || get().wallpaper.mode === mode) return;
    if (mode === "FIXED") get().setBackground((get().selection?.id ?? "none") as BackgroundId);
    else {
      savePreference("booksoul_guest_fixed", "");
      const selection = randomSelection("guest", systemCandidates(), get().selection);
      set({ wallpaper: { mode: "RANDOM" }, selection, background: selection?.id ?? "none" });
    }
  },
  setTheme: (theme) => {
    savePreference("booksoul_theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
    set({ theme });
  },
  setBackground: (background) => {
    if (get().scope !== "guest") return;
    savePreference("booksoul_background", background);
    savePreference("booksoul_guest_fixed", background);
    set({ background, selection: { kind: "SYSTEM", id: background }, wallpaper: { mode: "FIXED", kind: "SYSTEM", id: background } });
  },
}));

function systemCandidates(): WallpaperRef[] {
  return BACKGROUNDS.filter(item => item.image).map(item => ({ kind: "SYSTEM", id: item.id }));
}
function randomSelection(scope: string, candidates: WallpaperRef[], displayed?: WallpaperRef | null): WallpaperRef | null {
  // Generation isolates in-memory requests; last choice is shared by this account's logins.
  const ownerScope = scope.split(":generation:")[0];
  const key = `booksoul_wallpaper_previous:${ownerScope}`;
  let previous: WallpaperRef | null = null;
  try {
    const value: unknown = JSON.parse(readPreference(key) ?? "null");
    if (value && typeof value === "object" && "kind" in value && "id" in value &&
      (value.kind === "SYSTEM" || value.kind === "USER") && typeof value.id === "string") previous = { kind: value.kind, id: value.id };
  } catch { /* Ignore malformed local preferences. */ }
  const selected = chooseRandomWallpaper(candidates, displayed ?? previous, Math.random);
  if (selected) savePreference(key, JSON.stringify(selected));
  return selected;
}

export function backgroundUrl(image: string): string {
  return `${import.meta.env.BASE_URL}backgrounds/${image}`;
}
