import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAuthStore } from "@/store/useAuthStore";
import { commitMediaUpload, createMediaUpload, deleteWallpaper, fetchProfile, updateProfile, uploadDirect } from "./user-profile-api";

const user = { id: "fixture", name: "Reader", email: "reader@example.invalid", emailVerifiedAt: null };
const profile = { user, revision: 0, avatar: null, wallpapers: [], wallpaper: { mode: "RANDOM" }, mediaUploadsAvailable: true, mediaReadError: null };
const ticket = { assetId: "asset", uploadExpiresAt: "2026-10-04T01:05:00Z", commitExpiresAt: "2026-10-04T01:30:00Z", upload: { method: "POST" as const, url: "https://media.example.invalid/", fields: { key: "fixture-key", policy: "fixture-policy", success_action_status: "204" } } };
beforeEach(() => useAuthStore.getState().signIn({ user, accessToken: "fixture-token" }));
afterEach(() => { useAuthStore.getState().clearAuthentication(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const response = (data: unknown) => new Response(JSON.stringify({ success: true, data }));

it("uses the exact application endpoints, authenticated JSON and revision bodies", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => response(profile));
  await fetchProfile();
  await updateProfile({ name: "New", expectedRevision: 0 });
  await deleteWallpaper("a/b", 2);
  fetch.mockResolvedValue(response(ticket));
  await createMediaUpload({ purpose: "AVATAR", contentType: "image/png", byteSize: 5 });
  fetch.mockResolvedValue(response({ profile, alreadyCommitted: true }));
  expect((await commitMediaUpload("a/b", 2)).alreadyCommitted).toBe(true);
  expect(fetch.mock.calls.map(([path]) => path)).toEqual(["/api/users/me/profile", "/api/users/me/profile", "/api/users/me/wallpapers/a%2Fb", "/api/users/me/media/uploads", "/api/users/me/media/uploads/a%2Fb/commit"]);
  for (const [, options] of fetch.mock.calls) {
    expect(new Headers(options?.headers).get("Authorization")).toBe("Bearer fixture-token");
    expect(options?.credentials).toBe("include");
    expect(options?.cache).toBe("no-store");
  }
  expect(fetch.mock.calls[2][1]?.body).toBe(JSON.stringify({ expectedRevision: 2 }));
});

it("accepts unavailable private URLs but rejects malformed snapshots and commit responses", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ ...profile, avatar: { id: "avatar", url: null, expiresAt: null, width: 512, height: 512 }, mediaReadError: "MEDIA_STORAGE_UNAVAILABLE" }));
  expect((await fetchProfile()).avatar?.url).toBeNull();
  for (const invalid of [{ ...profile, revision: -1 }, { ...profile, wallpapers: [{ id: "x", url: "javascript:alert(1)", expiresAt: "bad", width: 1, height: 1 }] }, { ...profile, wallpaper: { mode: "FIXED", kind: "USER", id: "missing" } }]) {
    fetch.mockResolvedValue(response(invalid));
    await expect(fetchProfile()).rejects.toThrow();
  }
  fetch.mockResolvedValue(response({ profile, alreadyCommitted: "true" }));
  await expect(commitMediaUpload("asset", 0)).rejects.toThrow();
});

class FakeXhr {
  static current: FakeXhr;
  withCredentials = true; status = 204; timeout = 0;
  upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
  onload: (() => void) | null = null; onerror: (() => void) | null = null;
  onabort: (() => void) | null = null; ontimeout: (() => void) | null = null;
  open = vi.fn(); setRequestHeader = vi.fn(); send = vi.fn();
  abort = vi.fn(() => this.onabort?.());
  constructor() { FakeXhr.current = this; }
}
it("posts OSS fields verbatim with file last, without credentials, and reports progress", async () => {
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  const fetch = vi.spyOn(globalThis, "fetch");
  const progress = vi.fn();
  const file = new File(["image"], "fixture.png", { type: "image/png" });
  const pending = uploadDirect(ticket, file, { onProgress: progress });
  const xhr = FakeXhr.current;
  expect(xhr.open).toHaveBeenCalledWith("POST", ticket.upload.url);
  expect(xhr.withCredentials).toBe(false);
  expect(xhr.setRequestHeader).not.toHaveBeenCalled();
  expect([...((xhr.send.mock.calls[0] as unknown[])[0] as FormData).keys()]).toEqual([...Object.keys(ticket.upload.fields), "file"]);
  xhr.upload.onprogress?.({ lengthComputable: true, loaded: 2, total: 4 } as ProgressEvent);
  expect(progress).toHaveBeenCalledWith(expect.objectContaining({ percent: 50 }));
  xhr.onload?.();
  await pending;
  expect(fetch).not.toHaveBeenCalled();
});
it("aborts OSS uploads and never refreshes application tokens on OSS 403", async () => {
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  const fetch = vi.spyOn(globalThis, "fetch");
  const controller = new AbortController();
  const file = new File(["x"], "fixture.png");
  const pending = uploadDirect(ticket, file, { signal: controller.signal });
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(FakeXhr.current.abort).toHaveBeenCalledOnce();
  const denied = uploadDirect(ticket, file, {});
  FakeXhr.current.status = 403; FakeXhr.current.onload?.();
  await expect(denied).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});

it("rejects same-origin OSS tickets because XHR would otherwise send application cookies", async () => {
  vi.stubGlobal("location", new URL("https://media.example.invalid/"));
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => response(ticket));
  await expect(createMediaUpload({ purpose: "AVATAR", contentType: "image/png", byteSize: 5 })).rejects.toThrow();
});
