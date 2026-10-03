import { create } from "zustand";

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
// Pick once at page entry, so route changes and streaming never change the view.
// Exclude the last wallpaper to avoid an immediate repeat on refresh.
const entryBackgrounds = BACKGROUNDS.filter(
  (scene) => scene.image && scene.id !== savedBackground,
);
const entryBackground =
  entryBackgrounds[Math.floor(Math.random() * entryBackgrounds.length)].id;
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
  background: BackgroundId;
  setTheme: (theme: Theme) => void;
  setBackground: (background: BackgroundId) => void;
}>((set) => ({
  theme: initialTheme,
  background: entryBackground,
  setTheme: (theme) => {
    savePreference("booksoul_theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
    set({ theme });
  },
  setBackground: (background) => {
    savePreference("booksoul_background", background);
    set({ background });
  },
}));

export function backgroundUrl(image: string): string {
  return `${import.meta.env.BASE_URL}backgrounds/${image}`;
}
