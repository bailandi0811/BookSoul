import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ProfileAvatar } from "./ProfileAvatar";
import { useAuthStore } from "@/store/useAuthStore";
import { useUserProfileStore } from "@/store/useUserProfileStore";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => { useAuthStore.getState().clearAuthentication(); vi.restoreAllMocks(); });
it("uses a fixed-size private image and restores the initial with a retry after image failure", async () => {
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(<ProfileAvatar name="书友" media={{ id: "avatar", url: "https://media.example.invalid/avatar", expiresAt: "2026-10-04T15:00:00Z", width: 512, height: 512 }} size={56} />));
    const img = container.querySelector("img")!;
    expect(img.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(img.width).toBe(56);
    await act(async () => img.dispatchEvent(new Event("error")));
    expect(container.textContent).toContain("书");
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="重试头像"]')!.click());
    expect(container.querySelector("img")).not.toBeNull();
  } finally { await act(async () => root.unmount()); }
});

it.each(["new", "same"])("refetches failed avatar links and retries when the returned URL is %s", async variant => {
  const user = { id: "avatar-fixture", name: "Reader", email: "reader@example.invalid", emailVerifiedAt: null };
  const avatar = { id: "avatar", url: "https://media.example.invalid/expired", expiresAt: "2020-01-01T00:00:00Z", width: 512, height: 512 };
  const profile = { user, revision: 1, avatar, wallpapers: [], wallpaper: { mode: "RANDOM" }, mediaUploadsAvailable: true, mediaReadError: null };
  useAuthStore.getState().signIn({ user, accessToken: "fixture" });
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ success: true, data: profile })));
  await useUserProfileStore.getState().loadProfile();
  function CurrentAvatar() {
    const media = useUserProfileStore(state => state.profile?.avatar ?? null);
    return <ProfileAvatar name={user.name} media={media} />;
  }
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(<CurrentAvatar />));
    await act(async () => container.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(container.querySelector("img")).toBeNull();
    const refreshed = { ...avatar, url: variant === "new" ? "https://media.example.invalid/refreshed" : avatar.url, expiresAt: new Date(Date.now() + 900000).toISOString() };
    fetch.mockImplementation(async () => new Response(JSON.stringify({ success: true, data: { ...profile, avatar: refreshed } })));
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="重试头像"]')!.click());
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.at(-1)?.[0]).toBe("/api/users/me/profile");
    expect(container.querySelector("img")?.src).toBe(refreshed.url);
    expect(container.querySelector('[aria-label="重试头像"]')).toBeNull();
  } finally { await act(async () => root.unmount()); }
});

it("keeps the failed avatar retry available when profile refresh fails", async () => {
  const user = { id: "avatar-fixture", name: "Reader", email: "reader@example.invalid", emailVerifiedAt: null };
  const avatar = { id: "avatar", url: "https://media.example.invalid/expired", expiresAt: "2020-01-01T00:00:00Z", width: 512, height: 512 };
  useAuthStore.getState().signIn({ user, accessToken: "fixture" });
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(<ProfileAvatar name={user.name} media={avatar} />));
    await act(async () => container.querySelector("img")!.dispatchEvent(new Event("error")));
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="重试头像"]')!.click());
    expect(fetch).toHaveBeenCalledOnce();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[aria-label="重试头像"]')).not.toBeNull();
    expect(useUserProfileStore.getState().error).toBe("offline");
  } finally { await act(async () => root.unmount()); }
});
