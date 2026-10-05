import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useUserProfileSync } from "./useUserProfileSync";
import { useAuthStore } from "@/store/useAuthStore";
import { useUserProfileStore } from "@/store/useUserProfileStore";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const user = { id: "sync-fixture", email: "reader@example.invalid", name: "Reader", emailVerifiedAt: null };
let root: Root, container: HTMLDivElement;
function Sync({ ready = true }: { ready?: boolean }) { useUserProfileSync(ready); return null; }
beforeEach(() => { container = document.createElement("div"); root = createRoot(container); useAuthStore.getState().clearAuthentication(); });
afterEach(async () => { await act(async () => root.unmount()); useAuthStore.getState().clearAuthentication(); vi.restoreAllMocks(); vi.useRealTimers(); });
it("waits for session restoration, loads on login, and does not reload on token refresh", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ success: true, data: { user, revision: 0, avatar: null, wallpapers: [], wallpaper: { mode: "RANDOM" }, mediaUploadsAvailable: true, mediaReadError: null } })));
  await act(async () => { useAuthStore.getState().signIn({ user, accessToken: "fixture" }); root.render(createElement(Sync, { ready: false })); });
  expect(fetch).not.toHaveBeenCalled();
  await act(async () => root.render(createElement(Sync)));
  expect(fetch).toHaveBeenCalledOnce();
  await act(async () => useAuthStore.getState().updateTokens("refreshed"));
  expect(fetch).toHaveBeenCalledOnce();
  await act(async () => useAuthStore.getState().clearAuthentication());
  expect(useUserProfileStore.getState().profile).toBeNull();
});
it("refreshes expiring links only while visible and does not loop after a failure", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-04T00:00:00Z"));
  let visible = true;
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visible ? "visible" : "hidden");
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ success: true, data: { user, revision: 0, avatar: { id: "avatar", width: 512, height: 512, url: "https://media.example.invalid/avatar", expiresAt: "2026-10-04T00:02:00Z" }, wallpapers: [], wallpaper: { mode: "RANDOM" }, mediaUploadsAvailable: true, mediaReadError: null } })));
  await act(async () => { useAuthStore.getState().signIn({ user, accessToken: "fixture" }); root.render(createElement(Sync)); });
  visible = false;
  await act(async () => vi.advanceTimersByTimeAsync(61000));
  expect(fetch).toHaveBeenCalledOnce();
  fetch.mockRejectedValue(new Error("offline")); visible = true;
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  expect(fetch).toHaveBeenCalledTimes(2);
  await act(async () => vi.advanceTimersByTimeAsync(3600000));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(useUserProfileStore.getState().profile?.avatar?.id).toBe("avatar");
  expect(useUserProfileStore.getState().error).toBe("offline");
});
