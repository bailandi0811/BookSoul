import { useAuthStore, type AuthTokens } from "@/store/useAuthStore";
import { parseAuthTokens, successData } from "./auth-contract";
import { withAuthTimeout } from "./auth-request";

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
  | { status: "unauthorized" | "unavailable" | "superseded" };

export type AuthenticationRefreshStatus =
  | "authenticated"
  | "unauthorized"
  | "unavailable";
// A stale response must neither restore nor clear a newer session.
export type RefreshStatus = AuthenticationRefreshStatus | "superseded";

const REFRESH_LOCK_NAME = "booksoul:refresh-token";
let refreshPromise: {
  generation: number;
  promise: Promise<RefreshResult>;
} | null = null;

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

async function performTokenRefresh(signal: AbortSignal): Promise<RefreshResult> {
  try {
    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
      signal,
    });
    if (response.status === 401 || response.status === 403) {
      return { status: "unauthorized" };
    }
    if (!response.ok) return { status: "unavailable" };
    const payload: unknown = await response.json();
    return { status: "success", data: parseAuthTokens(successData(payload)) };
  } catch {
    return { status: "unavailable" };
  }
}

async function performCoordinatedTokenRefresh(
  generation: number,
  signal: AbortSignal,
): Promise<RefreshResult> {
  const run = async () => {
    signal.throwIfAborted();
    return generation === useAuthStore.getState().authGeneration
      ? performTokenRefresh(signal)
      : Promise.resolve({ status: "superseded" } as const);
  };
  if (!globalThis.navigator?.locks) return run();
  return await globalThis.navigator.locks.request(
    REFRESH_LOCK_NAME,
    { signal },
    run,
  );
}

function requestTokenRefresh(): {
  generation: number;
  promise: Promise<RefreshResult>;
} {
  if (refreshPromise) return refreshPromise;
  const generation = useAuthStore.getState().authGeneration;
  const pendingRefresh = withAuthTimeout((signal) =>
    performCoordinatedTokenRefresh(generation, signal),
  );
  const coordinatedRefresh = pendingRefresh
    .catch(() => ({ status: "unavailable" }) as const)
    .finally(() => {
      refreshPromise = null;
    });
  refreshPromise = { generation, promise: coordinatedRefresh };
  return refreshPromise;
}

export async function refreshAuthentication(
  options: { signal?: AbortSignal } = {},
): Promise<RefreshStatus> {
  const state = useAuthStore.getState();
  const generation = state.authGeneration;
  const userId = state.user?.id;
  if (options.signal?.aborted) return "superseded";
  const pending = requestTokenRefresh();
  let result: RefreshResult;
  try {
    // Cancel this waiter without canceling the refresh used by other callers.
    result = await withAuthTimeout(() => pending.promise, options.signal);
  } catch {
    return options.signal?.aborted ||
      generation !== useAuthStore.getState().authGeneration
      ? "superseded"
      : "unavailable";
  }
  if (
    options.signal?.aborted ||
    generation !== useAuthStore.getState().authGeneration ||
    pending.generation !== generation
  )
    return "superseded";
  if (result.status === "success") {
    if (userId && result.data.user.id !== userId) return "superseded";
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
  for (const line of xhr
    .getAllResponseHeaders()
    .trim()
    .split(/[\r\n]+/)) {
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    headers.append(
      line.slice(0, separator).trim(),
      line.slice(separator + 1).trim(),
    );
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
  const generation = useAuthStore.getState().authGeneration;
  const response = await fetch(input, {
    ...requestOptions,
    credentials: "include",
    headers: withIdentityHeaders(options),
  });
  if (response.status !== 401 || skipRefresh || skipAuth) {
    return response;
  }
  if (!useAuthStore.getState().user) return response;
  if (
    generation !== useAuthStore.getState().authGeneration ||
    options.signal?.aborted
  )
    return response;
  const refreshStatus = await refreshAuthentication({
    signal: options.signal ?? undefined,
  });
  if (
    refreshStatus !== "authenticated" ||
    generation !== useAuthStore.getState().authGeneration ||
    options.signal?.aborted
  )
    return response;
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
  const generation = useAuthStore.getState().authGeneration;
  const response = await uploadRequest(input, body, onProgress);
  if (response.status !== 401 || !useAuthStore.getState().user) {
    return response;
  }
  if (generation !== useAuthStore.getState().authGeneration) return response;
  const refreshStatus = await refreshAuthentication();
  if (
    refreshStatus !== "authenticated" ||
    generation !== useAuthStore.getState().authGeneration
  )
    return response;
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
