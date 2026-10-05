import { apiFetch, type ApiUploadProgress } from "./api";
import { assertCurrentAuthentication, parseAuthUser, record, successData } from "./auth-contract";
import { useAuthStore, type AuthUser } from "@/store/useAuthStore";
import { BACKGROUNDS } from "@/store/useAppearanceStore";

/** Personal scenes share the preset accordion, so the shelf stays short enough to open. */
export const WALLPAPER_LIMIT = 4;
export type MediaPurpose = "AVATAR" | "WALLPAPER";
export type WallpaperSelection =
  | { mode: "RANDOM" }
  | { mode: "FIXED"; kind: "SYSTEM" | "USER"; id: string };
export type ReadableMedia = { id: string; url: string | null; expiresAt: string | null; width: number; height: number };
export type ProfileSnapshot = {
  user: AuthUser; revision: number; avatar: ReadableMedia | null;
  wallpapers: ReadableMedia[]; wallpaper: WallpaperSelection;
  mediaUploadsAvailable: boolean; mediaReadError: "MEDIA_STORAGE_UNAVAILABLE" | null;
};
export type UploadTicket = {
  assetId: string; uploadExpiresAt: string; commitExpiresAt: string;
  upload: { method: "POST"; url: string; fields: Record<string, string> };
};
export type UpdateProfileInput = { name?: string; resetAvatar?: true; wallpaper?: WallpaperSelection; expectedRevision: number };
export type MediaUploadInput = { purpose: MediaPurpose; contentType: string; byteSize: number };
export class ProfileApiError extends Error {
  constructor(public status: number, public code: string | null, message: string) { super(message); }
}
function invalid(): never { throw new Error("资料服务返回无效数据，请重试"); }
const integer = (value: unknown, min = 0): value is number => Number.isSafeInteger(value) && (value as number) >= min;
const date = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
function safeUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }
  catch { return false; }
}
function safeUploadUrl(value: unknown): value is string {
  // withCredentials=false only suppresses cookies for cross-origin XHR.
  return safeUrl(value) && new URL(value).origin !== globalThis.location.origin;
}
function media(value: unknown): ReadableMedia {
  const item = record(value);
  if (typeof item.id !== "string" || !item.id || !integer(item.width, 1) || !integer(item.height, 1) ||
      !((item.url === null && item.expiresAt === null) || (safeUrl(item.url) && date(item.expiresAt)))) return invalid();
  return { id: item.id, width: item.width, height: item.height, url: item.url as string | null, expiresAt: item.expiresAt as string | null };
}
export function parseProfileSnapshot(value: unknown): ProfileSnapshot {
  const data = record(value);
  if (!integer(data.revision) || !Array.isArray(data.wallpapers) || typeof data.mediaUploadsAvailable !== "boolean" ||
      !(data.mediaReadError === null || data.mediaReadError === "MEDIA_STORAGE_UNAVAILABLE")) return invalid();
  const wallpapers = data.wallpapers.map(media);
  if (new Set(wallpapers.map(item => item.id)).size !== wallpapers.length) return invalid();
  const selection = record(data.wallpaper);
  let wallpaper: WallpaperSelection;
  if (selection.mode === "RANDOM") wallpaper = { mode: "RANDOM" };
  else if (selection.mode === "FIXED" && typeof selection.id === "string" &&
    ((selection.kind === "SYSTEM" && BACKGROUNDS.some(item => item.id === selection.id)) ||
     (selection.kind === "USER" && wallpapers.some(item => item.id === selection.id)))) {
    wallpaper = { mode: "FIXED", kind: selection.kind, id: selection.id };
  } else return invalid();
  return { user: parseAuthUser(data.user), revision: data.revision, avatar: data.avatar === null ? null : media(data.avatar),
    wallpapers, wallpaper, mediaUploadsAvailable: data.mediaUploadsAvailable, mediaReadError: data.mediaReadError };
}
function parseTicket(value: unknown): UploadTicket {
  const data = record(value), upload = record(data.upload), fields = record(upload.fields);
  if (typeof data.assetId !== "string" || !data.assetId || !date(data.uploadExpiresAt) || !date(data.commitExpiresAt) ||
      upload.method !== "POST" || !safeUploadUrl(upload.url) || "file" in fields || !Object.values(fields).every(field => typeof field === "string")) return invalid();
  return { assetId: data.assetId, uploadExpiresAt: data.uploadExpiresAt, commitExpiresAt: data.commitExpiresAt,
    upload: { method: "POST", url: upload.url, fields: fields as Record<string, string> } };
}
async function request<T>(path: string, parse: (data: unknown) => T, method: string, input?: unknown, parent?: AbortSignal, timeout = 15000): Promise<T> {
  parent?.throwIfAborted();
  const generation = useAuthStore.getState().authGeneration;
  const controller = new AbortController();
  const cancel = () => controller.abort(parent?.reason);
  parent?.addEventListener("abort", cancel, { once: true });
  let rejectAbort!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener("abort", rejectAbort, { once: true });
  });
  const timer = setTimeout(() => controller.abort(new DOMException("资料服务连接超时，请重试", "TimeoutError")), timeout);
  try {
    return await Promise.race([aborted, (async () => {
      const response = await apiFetch(`/api/users/me${path}`, { method, cache: "no-store", signal: controller.signal,
        ...(input === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }) });
      assertCurrentAuthentication(generation, controller.signal);
      const payload: unknown = await response.json();
      assertCurrentAuthentication(generation, controller.signal);
      if (!response.ok) {
        const error = record(payload);
        throw new ProfileApiError(response.status, typeof error.code === "string" ? error.code : null,
          typeof error.message === "string" ? error.message : "资料暂时无法保存，请重试");
      }
      return parse(successData(payload));
    })()]);
  } finally {
    clearTimeout(timer); parent?.removeEventListener("abort", cancel);
    controller.signal.removeEventListener("abort", rejectAbort);
  }
}
export const fetchProfile = (signal?: AbortSignal) => request("/profile", parseProfileSnapshot, "GET", undefined, signal);
export const updateProfile = (input: UpdateProfileInput, signal?: AbortSignal) => request("/profile", parseProfileSnapshot, "PATCH", input, signal);
export const createMediaUpload = (input: MediaUploadInput, signal?: AbortSignal) => request("/media/uploads", parseTicket, "POST", input, signal);
export const deleteWallpaper = (assetId: string, revision: number, signal?: AbortSignal) => request(`/wallpapers/${encodeURIComponent(assetId)}`, parseProfileSnapshot, "DELETE", { expectedRevision: revision }, signal);
export const commitMediaUpload = (assetId: string, revision: number, signal?: AbortSignal) => request(`/media/uploads/${encodeURIComponent(assetId)}/commit`, data => {
  const result = record(data);
  if (typeof result.alreadyCommitted !== "boolean") return invalid();
  return { profile: parseProfileSnapshot(result.profile), alreadyCommitted: result.alreadyCommitted };
}, "POST", { expectedRevision: revision }, signal, 90000);

export function uploadDirect(ticket: UploadTicket, file: File, { signal, onProgress }: { signal?: AbortSignal; onProgress?: (progress: ApiUploadProgress) => void } = {}): Promise<void> {
  signal?.throwIfAborted();
  if (!safeUploadUrl(ticket.upload.url)) return Promise.reject(new Error("图片上传地址无效，请重新签发"));
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const cancel = () => xhr.abort();
    const finish = (error?: Error) => {
      signal?.removeEventListener("abort", cancel);
      xhr.onload = xhr.onerror = xhr.onabort = xhr.ontimeout = null;
      xhr.upload.onprogress = null;
      if (error) reject(error); else resolve();
    };
    xhr.open("POST", ticket.upload.url);
    xhr.withCredentials = false;
    xhr.timeout = 60000;
    xhr.upload.onprogress = event => {
      if (event.lengthComputable && event.total > 0) onProgress?.({ loadedBytes: event.loaded, totalBytes: event.total, percent: Math.min(100, Math.round(event.loaded / event.total * 100)) });
    };
    xhr.onload = () => finish(xhr.status >= 200 && xhr.status < 300 ? undefined : new ProfileApiError(xhr.status, null, "图片直传失败，请重新上传"));
    xhr.onerror = () => finish(new Error("图片直传连接失败，请重试"));
    xhr.ontimeout = () => finish(new DOMException("图片直传超时，请重试", "TimeoutError"));
    xhr.onabort = () => finish(new DOMException("上传已取消", "AbortError"));
    const form = new FormData();
    for (const [key, value] of Object.entries(ticket.upload.fields)) form.append(key, value);
    form.append("file", file);
    signal?.addEventListener("abort", cancel, { once: true });
    try { xhr.send(form); } catch (error) { finish(error instanceof Error ? error : new Error("图片直传失败")); }
  });
}

export function validateMediaFile(file: File, purpose: MediaPurpose): string | null {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || !/\.(jpe?g|png|webp)$/i.test(file.name)) return "请选择 JPEG、PNG 或静态 WebP 图片";
  const limit = purpose === "AVATAR" ? 5 : 10;
  if (file.size < 1 || file.size > limit * 1024 * 1024) return `图片大小须在 1 字节至 ${limit} MiB 之间`;
  return null;
}
