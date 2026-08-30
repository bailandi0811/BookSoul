import { useAuthStore, type AuthTokens } from "@/store/useAuthStore";

interface ApiOptions extends RequestInit {
  skipAuth?: boolean;
  skipRefresh?: boolean;
}

export interface ApiUploadProgress {
  loadedBytes: number;
  totalBytes: number;
  percent: number;
}

type RefreshResult =
  | { status: "success"; data: AuthTokens }
  | { status: "unauthorized" | "unavailable" };

export type AuthenticationRefreshStatus =
  | "authenticated"
  | "unauthorized"
  | "unavailable";

const REFRESH_LOCK_NAME = "booksoul:refresh-token";
let refreshPromise: Promise<RefreshResult> | null = null;

function withIdentityHeaders(options: ApiOptions): Headers {
  const headers = new Headers(options.headers);
  const auth = useAuthStore.getState();
  if (!options.skipAuth && auth.accessToken) {
    headers.set("Authorization", `Bearer ${auth.accessToken}`);
  }
  return headers;
}

function invalidateAuthentication(): void {
  useAuthStore.getState().clearAuthentication();
  window.dispatchEvent(new Event("booksoul:auth-invalidated"));
}

async function performTokenRefresh(): Promise<RefreshResult> {
  try {
    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
    if (response.status === 401 || response.status === 403) {
      return { status: "unauthorized" };
    }
    if (!response.ok) return { status: "unavailable" };
    const payload = (await response.json()) as {
      success: true;
      data: AuthTokens;
    };
    return { status: "success", data: payload.data };
  } catch {
    return { status: "unavailable" };
  }
}

async function performCoordinatedTokenRefresh(): Promise<RefreshResult> {
  if (!globalThis.navigator?.locks) return performTokenRefresh();
  return await globalThis.navigator.locks.request(
    REFRESH_LOCK_NAME,
    () => performTokenRefresh(),
  );
}

function requestTokenRefresh(): Promise<RefreshResult> {
  if (refreshPromise) return refreshPromise;
  const pendingRefresh = performCoordinatedTokenRefresh();
  const coordinatedRefresh = pendingRefresh
    .catch(() => ({ status: "unavailable" }) as const)
    .finally(() => {
      refreshPromise = null;
    });
  refreshPromise = coordinatedRefresh;
  return coordinatedRefresh;
}

export async function refreshAuthentication(): Promise<AuthenticationRefreshStatus> {
  const result = await requestTokenRefresh();
  if (result.status === "success") {
    useAuthStore.getState().restoreSession(result.data);
    return "authenticated";
  }
  if (result.status === "unauthorized" && useAuthStore.getState().user) {
    invalidateAuthentication();
  }
  return result.status;
}

function responseHeadersFromXhr(xhr: XMLHttpRequest): Headers {
  const headers = new Headers();
  for (const line of xhr.getAllResponseHeaders().trim().split(/[\r\n]+/)) {
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    headers.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  return headers;
}

function uploadRequest(
  input: string,
  body: FormData,
  onProgress?: (progress: ApiUploadProgress) => void,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", input);
    xhr.withCredentials = true;
    withIdentityHeaders({}).forEach((value, name) => {
      xhr.setRequestHeader(name, value);
    });
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      onProgress?.({
        loadedBytes: event.loaded,
        totalBytes: event.total,
        percent: Math.min(100, Math.round((event.loaded / event.total) * 100)),
      });
    };
    xhr.onload = () => {
      resolve(
        new Response(xhr.responseText, {
          status: xhr.status,
          statusText: xhr.statusText,
          headers: responseHeadersFromXhr(xhr),
        }),
      );
    };
    xhr.onerror = () => reject(new Error("网络连接失败，请检查后重试"));
    xhr.onabort = () => reject(new Error("上传已取消"));
    xhr.send(body);
  });
}

export async function apiFetch(
  input: RequestInfo | URL,
  options: ApiOptions = {},
): Promise<Response> {
  const { skipAuth, skipRefresh, ...requestOptions } = options;
  const response = await fetch(input, {
    ...requestOptions,
    credentials: "include",
    headers: withIdentityHeaders(options),
  });
  if (response.status !== 401 || skipRefresh || skipAuth) {
    return response;
  }
  if (!useAuthStore.getState().user) return response;
  const refreshStatus = await refreshAuthentication();
  if (refreshStatus !== "authenticated") return response;
  return fetch(input, {
    ...requestOptions,
    credentials: "include",
    headers: withIdentityHeaders(options),
  });
}

export async function apiUpload(
  input: string,
  body: FormData,
  onProgress?: (progress: ApiUploadProgress) => void,
): Promise<Response> {
  const response = await uploadRequest(input, body, onProgress);
  if (response.status !== 401 || !useAuthStore.getState().user) {
    return response;
  }
  const refreshStatus = await refreshAuthentication();
  if (refreshStatus !== "authenticated") return response;
  return uploadRequest(input, body, onProgress);
}

export async function readApiError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      message?: string | string[];
      error?: string;
    };
    if (Array.isArray(payload.message)) return payload.message.join("，");
    return payload.message ?? payload.error ?? "请求失败，请稍后重试";
  } catch {
    return "网络请求失败，请稍后重试";
  }
}
