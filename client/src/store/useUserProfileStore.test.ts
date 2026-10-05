import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAuthStore } from "./useAuthStore";
import { useAppearanceStore } from "./useAppearanceStore";
import { useUserProfileStore } from "./useUserProfileStore";
import * as profileApi from "@/lib/user-profile-api";

const user = { id: "A", name: "Reader", email: "a@example.invalid", emailVerifiedAt: null };
const profile = (revision = 0) => ({ user, revision, avatar: null, wallpapers: [], wallpaper: { mode: "RANDOM" as const }, mediaUploadsAvailable: true, mediaReadError: null });
const response = (data: unknown) => new Response(JSON.stringify({ success: true, data }));
beforeEach(() => { localStorage.clear(); useAuthStore.getState().signIn({ user, accessToken: "fixture" }); });
afterEach(() => { useAuthStore.getState().clearAuthentication(); vi.restoreAllMocks(); });

it.each(["B", "A"])("discards delayed responses after signing in as %s with a new generation", async (id) => {
  let resolve!: (value: Response) => void;
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(r => { resolve = r; }));
  const pending = useUserProfileStore.getState().loadProfile();
  const signal = fetch.mock.calls[0][1]?.signal;
  useAuthStore.getState().signIn({ user: { ...user, id }, accessToken: "new" });
  expect(signal?.aborted).toBe(true);
  expect(useUserProfileStore.getState().profile).toBeNull();
  expect(useAppearanceStore.getState().selection).toBeNull();
  resolve(response(profile()));
  await pending;
  expect(useUserProfileStore.getState().profile).toBeNull();
});
it("clears private state synchronously on logout and preserves the latest name against auth refresh", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ ...profile(2), user: { ...user, name: "Saved" } }));
  await useUserProfileStore.getState().loadProfile();
  useAuthStore.getState().restoreSession({ user, accessToken: "refreshed" });
  expect(useUserProfileStore.getState().profile?.user.name).toBe("Saved");
  useAuthStore.getState().clearAuthentication();
  expect(useUserProfileStore.getState().profile).toBeNull();
  expect(useAppearanceStore.getState().selection?.kind).not.toBe("USER");
});
it("does not let an old GET replace a newer save", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(response(profile()));
  await useUserProfileStore.getState().loadProfile();
  let resolve!: (value: Response) => void;
  fetch.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const oldGet = useUserProfileStore.getState().loadProfile();
  fetch.mockResolvedValue(response({ ...profile(1), user: { ...user, name: "Saved" } }));
  await useUserProfileStore.getState().updateProfile({ name: "Saved" });
  resolve(response(profile())); await oldGet;
  expect(useUserProfileStore.getState().profile?.revision).toBe(1);
  expect(useUserProfileStore.getState().profile?.user.name).toBe("Saved");
});

it("does not report an obsolete GET error after a newer successful save", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => response(profile()));
  await useUserProfileStore.getState().loadProfile();
  let fail!: (error: Error) => void;
  fetch.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
  const oldGet = useUserProfileStore.getState().loadProfile();
  fetch.mockImplementation(async () => response(profile(1)));
  await useUserProfileStore.getState().updateProfile({ name: "Saved" });
  fail(new Error("obsolete error")); await oldGet;
  expect(useUserProfileStore.getState().error).toBeNull();
});
it("selects once from system and owned READY images; URL refresh and gallery additions do not redraw", async () => {
  const random = vi.spyOn(Math, "random").mockReturnValue(0.999);
  const media = { id: "owned", url: "https://media.example.invalid/one", expiresAt: "2026-10-04T03:00:00Z", width: 100, height: 100 };
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ ...profile(), wallpapers: [media] }));
  await useUserProfileStore.getState().loadProfile();
  expect(useAppearanceStore.getState().selection).toEqual({ kind: "USER", id: "owned" });
  const calls = random.mock.calls.length;
  fetch.mockResolvedValue(response({ ...profile(1), wallpapers: [{ ...media, url: "https://media.example.invalid/two" }, { ...media, id: "new" }] }));
  await useUserProfileStore.getState().loadProfile();
  expect(random).toHaveBeenCalledTimes(calls);
  expect(useAppearanceStore.getState().selection?.id).toBe("owned");
  const preferences = Array.from({ length: localStorage.length }, (_, i) => localStorage.getItem(localStorage.key(i)!));
  expect(JSON.stringify(preferences)).not.toContain("media.example.invalid");
  fetch.mockResolvedValue(response(profile(2)));
  await useUserProfileStore.getState().loadProfile();
  expect(random).toHaveBeenCalledTimes(calls + 1);
  expect(useAppearanceStore.getState().selection?.kind).toBe("SYSTEM");
});

it.each(["signing", "uploading"])("never commits after %s fails", async stage => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => response(profile()));
  await useUserProfileStore.getState().loadProfile();
  const ticket = { assetId: "asset", uploadExpiresAt: new Date(Date.now() + 300000).toISOString(), commitExpiresAt: new Date(Date.now() + 1800000).toISOString(), upload: { method: "POST", url: "https://media.example.invalid/", fields: { key: "fixture" } } };
  fetch.mockImplementation(async () => stage === "signing" ? new Response("{}", { status: 503 }) : response(ticket));
  vi.spyOn(profileApi, "uploadDirect").mockRejectedValue(new Error("offline"));
  await expect(useUserProfileStore.getState().uploadMedia(new File(["x"], "image.png", { type: "image/png" }), "AVATAR")).rejects.toThrow();
  expect(fetch.mock.calls.some(([path]) => String(path).endsWith("/commit"))).toBe(false);
  expect(useUserProfileStore.getState().profile?.revision).toBe(0);
});
it("retries the original asset after a lost commit response and keeps all returned state server-owned", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => response(profile()));
  await useUserProfileStore.getState().loadProfile();
  const ticket = { assetId: "same-asset", uploadExpiresAt: new Date(Date.now() + 300000).toISOString(), commitExpiresAt: new Date(Date.now() + 1800000).toISOString(), upload: { method: "POST", url: "https://media.example.invalid/", fields: {} } };
  fetch.mockImplementation(async path => { if (String(path).endsWith("/commit")) throw new Error("lost response"); return response(ticket); });
  vi.spyOn(profileApi, "uploadDirect").mockResolvedValue();
  await expect(useUserProfileStore.getState().uploadMedia(new File(["x"], "image.png", { type: "image/png" }), "WALLPAPER")).rejects.toThrow("lost response");
  expect(useUserProfileStore.getState().profile?.revision).toBe(0);
  fetch.mockImplementation(async () => response({ profile: profile(1), alreadyCommitted: true }));
  await useUserProfileStore.getState().commitMedia(ticket.assetId);
  expect(fetch.mock.calls.filter(([path]) => String(path).endsWith("/commit")).map(([path]) => path)).toEqual(["/api/users/me/media/uploads/same-asset/commit", "/api/users/me/media/uploads/same-asset/commit"]);
  expect(useUserProfileStore.getState().profile?.revision).toBe(1);
});
it("restores fixed preferences and handles revision conflicts without overwriting local drafts", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ ...profile(), wallpaper: { mode: "FIXED", kind: "SYSTEM", id: "none" } }));
  await useUserProfileStore.getState().loadProfile();
  expect(useAppearanceStore.getState().selection).toEqual({ kind: "SYSTEM", id: "none" });
  fetch.mockResolvedValueOnce(new Response(JSON.stringify({ code: "PROFILE_REVISION_CONFLICT", message: "Conflict" }), { status: 409 })).mockResolvedValue(response(profile(4)));
  await expect(useUserProfileStore.getState().updateProfile({ name: "Draft" })).rejects.toMatchObject({ status: 409 });
  expect(useUserProfileStore.getState().profile?.revision).toBe(4);
});
