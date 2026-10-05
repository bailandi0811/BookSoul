import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ScenicBackground } from "./ScenicBackground";
import { useAuthStore } from "@/store/useAuthStore";
import { useUserProfileStore } from "@/store/useUserProfileStore";
import { useAppearanceStore } from "@/store/useAppearanceStore";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => { useAuthStore.getState().clearAuthentication(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("preloads private URLs, refreshes the same asset without redrawing, and clears on identity change", async () => {
  const loaders: HTMLImageElement[] = [];
  vi.stubGlobal("Image", class { onload: (() => void) | null = null; onerror: (() => void) | null = null; src = ""; referrerPolicy = ""; constructor() { loaders.push(this as unknown as HTMLImageElement); } });
  const user = { id: "scenic-fixture", name: "Reader", email: "reader@example.invalid", emailVerifiedAt: null };
  const media = { id: "owned", url: "https://media.example.invalid/one", expiresAt: "2026-10-04T15:00:00Z", width: 1200, height: 900 };
  const profile = { user, revision: 0, avatar: null, wallpapers: [media], wallpaper: { mode: "FIXED", kind: "USER", id: "owned" }, mediaUploadsAvailable: true, mediaReadError: null };
  useAuthStore.getState().signIn({ user, accessToken: "fixture" });
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ success: true, data: profile })));
  await useUserProfileStore.getState().loadProfile();
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(<ScenicBackground />));
    expect(loaders.at(-1)?.src).toBe(media.url);
    expect(loaders.at(-1)?.referrerPolicy).toBe("no-referrer");
    await act(async () => (loaders.at(-1)!.onload as (() => void) | null)?.());
    expect(container.querySelector("img")?.src).toBe(media.url);
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ success: true, data: { ...profile, wallpapers: [{ ...media, url: "https://media.example.invalid/two" }] } })));
    await act(async () => useUserProfileStore.getState().loadProfile());
    await act(async () => (loaders.at(-1)!.onload as (() => void) | null)?.());
    expect(useAppearanceStore.getState().selection?.id).toBe("owned");
    expect(container.querySelector("img")?.src).toBe("https://media.example.invalid/two");
    await act(async () => useAuthStore.getState().signIn({ user: { ...user, id: "other" }, accessToken: "new" }));
    expect(container.querySelector("img")).toBeNull();
    expect(useAppearanceStore.getState().selection).toBeNull();
  } finally { await act(async () => root.unmount()); }
});
