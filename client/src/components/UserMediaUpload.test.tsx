import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { UserMediaUpload } from "./UserMediaUpload";
import { useAuthStore } from "@/store/useAuthStore";
import { useUserProfileStore } from "@/store/useUserProfileStore";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const user = { id: "upload-fixture", name: "Reader", email: "reader@example.invalid", emailVerifiedAt: null };
const profile = { user, revision: 0, avatar: null, wallpapers: [], wallpaper: { mode: "RANDOM" }, mediaUploadsAvailable: true, mediaReadError: null };
let root: Root, container: HTMLDivElement;
beforeEach(async () => {
  useAuthStore.getState().signIn({ user, accessToken: "fixture" });
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ success: true, data: profile })));
  await useUserProfileStore.getState().loadProfile();
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fixture"); vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  container = document.createElement("div"); root = createRoot(container);
  await act(async () => root.render(<UserMediaUpload purpose="AVATAR" onCommitted={() => {}} />));
});
afterEach(async () => { await act(async () => root.unmount()); useAuthStore.getState().clearAuthentication(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function select(file = new File(["image"], "fixture.png", { type: "image/png" })) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  await act(async () => { Object.defineProperty(input, "files", { configurable: true, value: [file] }); input.dispatchEvent(new Event("change", { bubbles: true })); });
}
it("previews locally, allows the same file again and releases previews on cancel and unmount", async () => {
  await select(); expect(container.querySelector("img")?.src).toBe("blob:fixture");
  await select(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fixture");
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="取消上传"]')!.click());
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector<HTMLInputElement>('input[type="file"]')!.value).toBe("");
  await select(); await act(async () => root.render(null));
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3);
});
it("rejects invalid files before preview or network upload", async () => {
  const calls = vi.mocked(fetch).mock.calls.length;
  await select(new File(["svg"], "fixture.svg", { type: "image/svg+xml" }));
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledTimes(calls);
});

class UploadXhr {
  static current: UploadXhr;
  withCredentials = false; status = 204; timeout = 0;
  upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
  onload: (() => void) | null = null; onerror: (() => void) | null = null;
  onabort: (() => void) | null = null; ontimeout: (() => void) | null = null;
  open() {} send() {} abort = vi.fn(() => this.onabort?.());
  constructor() { UploadXhr.current = this; }
}
it("shows upload progress and validation, then retries a lost commit using the original asset", async () => {
  vi.stubGlobal("XMLHttpRequest", UploadXhr);
  const onCommitted = vi.fn();
  await act(async () => root.render(<UserMediaUpload purpose="AVATAR" onCommitted={onCommitted} />));
  const ticket = { assetId: "original", uploadExpiresAt: new Date(Date.now() + 300000).toISOString(), commitExpiresAt: new Date(Date.now() + 1800000).toISOString(), upload: { method: "POST", url: "https://media.example.invalid/", fields: {} } };
  let fail!: (error: Error) => void;
  vi.mocked(fetch).mockImplementation(async path => {
    if (String(path).endsWith("/commit")) return new Promise<Response>((_, reject) => { fail = reject; });
    return new Response(JSON.stringify({ success: true, data: ticket }));
  });
  await select();
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="确认上传"]')!.click());
  expect(container.textContent).toContain("正在上传");
  await act(async () => UploadXhr.current.upload.onprogress?.({ lengthComputable: true, loaded: 3, total: 4 } as ProgressEvent));
  expect(container.querySelector("progress")?.value).toBe(75);
  await act(async () => UploadXhr.current.onload?.());
  expect(container.textContent).toContain("正在验证");
  expect(onCommitted).not.toHaveBeenCalled();
  await act(async () => fail(new Error("lost response")));
  expect(container.querySelector("img")?.src).toBe("blob:fixture");
  expect(container.textContent).toContain("重试确认");
  const saved = { ...profile, revision: 1, avatar: { id: "original", url: null, expiresAt: null, width: 512, height: 512 }, mediaReadError: "MEDIA_STORAGE_UNAVAILABLE" };
  vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ success: true, data: { profile: saved, alreadyCommitted: true } })));
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="确认上传"]')!.click());
  expect(onCommitted).toHaveBeenCalledWith(saved);
  expect(container.querySelector("img")).toBeNull();
  expect(container.textContent).toContain("已保存");
  expect(vi.mocked(fetch).mock.calls.filter(([path]) => String(path).endsWith("/commit")).map(([path]) => path)).toEqual(["/api/users/me/media/uploads/original/commit", "/api/users/me/media/uploads/original/commit"]);
});
it("cancels an active OSS upload and clears its preview without committing", async () => {
  vi.stubGlobal("XMLHttpRequest", UploadXhr);
  const ticket = { assetId: "cancelled", uploadExpiresAt: new Date(Date.now() + 300000).toISOString(), commitExpiresAt: new Date(Date.now() + 1800000).toISOString(), upload: { method: "POST", url: "https://media.example.invalid/", fields: {} } };
  vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ success: true, data: ticket })));
  await select();
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="确认上传"]')!.click());
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="取消上传"]')!.click());
  expect(UploadXhr.current.abort).toHaveBeenCalledOnce();
  expect(container.querySelector("img")).toBeNull();
  expect(vi.mocked(fetch).mock.calls.some(([path]) => String(path).endsWith("/commit"))).toBe(false);
});

it("retries a lost commit after the gallery fills without issuing another upload", async () => {
  vi.stubGlobal("XMLHttpRequest", UploadXhr);
  const onCommitted = vi.fn();
  const wallpapers = Array.from({ length: 3 }, (_, i) => ({ id: `owned-${i}`, url: null, expiresAt: null, width: 1200, height: 900 }));
  vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ success: true, data: { ...profile, wallpapers, mediaReadError: "MEDIA_STORAGE_UNAVAILABLE" } })));
  await act(async () => {
    await useUserProfileStore.getState().loadProfile();
    root.render(<UserMediaUpload purpose="WALLPAPER" onCommitted={onCommitted} />);
  });
  const ticket = { assetId: "twentieth", uploadExpiresAt: new Date(Date.now() + 300000).toISOString(), commitExpiresAt: new Date(Date.now() + 1800000).toISOString(), upload: { method: "POST", url: "https://media.example.invalid/", fields: {} } };
  vi.mocked(fetch).mockImplementation(async path => {
    if (String(path).endsWith("/commit")) throw new Error("lost response");
    return new Response(JSON.stringify({ success: true, data: ticket }));
  });
  await select();
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="确认上传"]')!.click());
  const xhr = UploadXhr.current;
  await act(async () => xhr.onload?.());
  expect(container.textContent).toContain("重试确认");
  vi.useFakeTimers();
  vi.setSystemTime(new Date(Date.parse(ticket.commitExpiresAt) + 1));
  const saved = { ...profile, revision: 1, wallpapers: [...wallpapers, { ...wallpapers[0], id: ticket.assetId }], mediaReadError: "MEDIA_STORAGE_UNAVAILABLE" };
  vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ success: true, data: saved })));
  await act(async () => useUserProfileStore.getState().loadProfile());
  expect(container.textContent).toContain("图库已满");
  expect(container.querySelector<HTMLInputElement>('input[type="file"]')!.disabled).toBe(true);
  expect(container.querySelector<HTMLButtonElement>('button[aria-label="确认上传"]')!.disabled).toBe(false);
  vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ success: true, data: { profile: saved, alreadyCommitted: true } })));
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="确认上传"]')!.click());
  expect(onCommitted).toHaveBeenCalledWith(saved);
  expect(UploadXhr.current).toBe(xhr);
  expect(vi.mocked(fetch).mock.calls.filter(([path]) => path === "/api/users/me/media/uploads")).toHaveLength(1);
  expect(vi.mocked(fetch).mock.calls.filter(([path]) => String(path).endsWith("/commit")).map(([path]) => path)).toEqual(["/api/users/me/media/uploads/twentieth/commit", "/api/users/me/media/uploads/twentieth/commit"]);
});

it("blocks a fresh upload when the gallery fills after local preview selection", async () => {
  await act(async () => root.render(<UserMediaUpload purpose="WALLPAPER" onCommitted={() => {}} />));
  await select();
  const wallpapers = Array.from({ length: 4 }, (_, i) => ({ id: `owned-${i}`, url: null, expiresAt: null, width: 1200, height: 900 }));
  vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ success: true, data: { ...profile, revision: 1, wallpapers, mediaReadError: "MEDIA_STORAGE_UNAVAILABLE" } })));
  await act(async () => useUserProfileStore.getState().loadProfile());
  const confirm = container.querySelector<HTMLButtonElement>('button[aria-label="确认上传"]')!;
  expect(confirm.disabled).toBe(true);
  const before = vi.mocked(fetch).mock.calls.length;
  await act(async () => confirm.click());
  expect(fetch).toHaveBeenCalledTimes(before);
  expect(container.querySelector("img")?.src).toBe("blob:fixture");
});
