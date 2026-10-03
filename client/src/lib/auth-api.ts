import { apiFetch, readApiError, refreshAuthentication } from "./api";
import { withAuthTimeout } from "./auth-request";
import {
  useAuthStore,
  type AuthTokens,
  type AuthUser,
} from "@/store/useAuthStore";
import {
  assertCurrentAuthentication,
  parseAuthTokens,
  parseAuthUser,
  record,
  successData,
} from "./auth-contract";

export type AuthRestoreStatus =
  | "authenticated"
  | "guest"
  | "unavailable"
  | "superseded";
type RequestOptions = { signal?: AbortSignal };
type LoginInput = { email: string; password: string };
type RegisterInput = LoginInput & {
  name: string;
  verificationId: string;
  code: string;
};
export type ChallengeReceipt = {
  verificationId: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
};

export class AuthFlowError extends Error {
  readonly code?: string;
  readonly retryAfterSeconds?: number;
  constructor(
    message: string,
    details?: { code?: string; retryAfterSeconds?: number },
  ) {
    super(message);
    this.name = "AuthFlowError";
    this.code = details?.code;
    this.retryAfterSeconds = details?.retryAfterSeconds;
  }
}
export async function readAuthFlowError(
  response: Response,
): Promise<AuthFlowError> {
  let payload: Record<string, unknown> = {};
  try {
    payload = record(await response.json());
  } catch {
    /* Fall back to a actionable transport error. */
  }
  const message =
    typeof payload.message === "string"
      ? payload.message
      : Array.isArray(payload.message) &&
          payload.message.every((part) => typeof part === "string")
        ? payload.message.join("，")
        : "请求失败，请稍后重试";
  const retry =
    typeof payload.retryAfterSeconds === "number"
      ? payload.retryAfterSeconds
      : Number(response.headers.get("Retry-After"));
  return new AuthFlowError(message, {
    code: typeof payload.code === "string" ? payload.code : undefined,
    retryAfterSeconds:
      Number.isFinite(retry) && retry > 0 ? Math.ceil(retry) : undefined,
  });
}
async function postAuth(
  path: string,
  input: unknown,
  options: RequestOptions = {},
  authenticated = false,
): Promise<unknown> {
  const response = await apiFetch("/api/auth/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: options.signal,
    skipAuth: !authenticated,
    skipRefresh: !authenticated,
  });
  if (!response.ok) throw await readAuthFlowError(response);
  const payload: unknown = await response.json();
  return successData(payload);
}

export function authenticate(
  mode: "login",
  input: LoginInput,
  options?: RequestOptions,
): Promise<AuthTokens>;
export function authenticate(
  mode: "register",
  input: RegisterInput,
  options?: RequestOptions,
): Promise<AuthTokens>;
export async function authenticate(
  mode: "login" | "register",
  input: LoginInput | RegisterInput,
  options: RequestOptions = {},
): Promise<AuthTokens> {
  const generation = useAuthStore.getState().authGeneration;
  const previousUserId = useAuthStore.getState().user?.id;
  const data = parseAuthTokens(await postAuth(mode, input, options));
  assertCurrentAuthentication(generation, options.signal);
  useAuthStore.getState().signIn(data);
  if (previousUserId && previousUserId !== data.user.id)
    window.dispatchEvent(new Event("booksoul:auth-invalidated"));
  return data;
}

export async function restoreAuthentication(
  options: RequestOptions = {},
): Promise<AuthRestoreStatus> {
  const existing = useAuthStore.getState();

  try {
    return await withAuthTimeout(async (signal) => {
      if (existing.user && existing.accessToken) {
        // Handle renewal here so temporary failures are distinct from logout.
        const response = await apiFetch("/api/auth/me", {
          signal,
          skipRefresh: true,
        });
        if (
          signal.aborted ||
          existing.authGeneration !== useAuthStore.getState().authGeneration
        )
          return "superseded";
        if (response.ok) {
          const data = record(successData(await response.json()));
          const user = parseAuthUser(data.user);
          if (
            signal.aborted ||
            existing.authGeneration !== useAuthStore.getState().authGeneration ||
            user.id !== existing.user.id
          )
            return "superseded";
          const accessToken = useAuthStore.getState().accessToken;
          if (!accessToken) return "guest";
          useAuthStore.getState().restoreSession({ accessToken, user });
          return "authenticated";
        }
        if (response.status !== 401) return "unavailable";
      }

      const refreshStatus = await refreshAuthentication({ signal });
      if (refreshStatus === "superseded") return "superseded";
      if (refreshStatus === "authenticated") return "authenticated";
      return refreshStatus === "unauthorized" ? "guest" : "unavailable";
    }, options.signal);
  } catch {
    if (
      options.signal?.aborted ||
      existing.authGeneration !== useAuthStore.getState().authGeneration
    )
      return "superseded";
    return "unavailable";
  }
}

function parseReceipt(value: unknown): ChallengeReceipt {
  const data = record(value);
  if (
    typeof data.verificationId !== "string" ||
    !data.verificationId ||
    typeof data.expiresInSeconds !== "number" ||
    !Number.isSafeInteger(data.expiresInSeconds) ||
    data.expiresInSeconds <= 0 ||
    typeof data.resendAfterSeconds !== "number" ||
    !Number.isSafeInteger(data.resendAfterSeconds) ||
    data.resendAfterSeconds < 0
  )
    throw new AuthFlowError("验证码申请返回无效数据，请重试");
  return {
    verificationId: data.verificationId,
    expiresInSeconds: data.expiresInSeconds,
    resendAfterSeconds: data.resendAfterSeconds,
  };
}
export async function requestRegistrationCode(
  email: string,
  options?: RequestOptions,
): Promise<ChallengeReceipt> {
  return parseReceipt(await postAuth("registration-code", { email }, options));
}
export async function requestCurrentUserVerificationCode(
  options?: RequestOptions,
): Promise<ChallengeReceipt> {
  return parseReceipt(
    await postAuth("email-verification/code", {}, options, true),
  );
}
export async function confirmCurrentUserEmail(
  input: { verificationId: string; code: string },
  options?: RequestOptions,
): Promise<AuthUser> {
  const state = useAuthStore.getState();
  const data = record(
    await postAuth("email-verification/confirm", input, options, true),
  );
  const user = parseAuthUser(data.user);
  assertCurrentAuthentication(state.authGeneration, options?.signal);
  if (user.id !== state.user?.id)
    throw new AuthFlowError("会话已变化，请重新验证");
  useAuthStore.getState().updateCurrentUser(user);
  return user;
}
export async function requestPasswordReset(
  email: string,
  options?: RequestOptions,
): Promise<{ message: string; resendAfterSeconds: number }> {
  const data = record(await postAuth("forgot-password", { email }, options));
  if (
    typeof data.message !== "string" ||
    typeof data.resendAfterSeconds !== "number" ||
    !Number.isSafeInteger(data.resendAfterSeconds) ||
    data.resendAfterSeconds < 0
  )
    throw new AuthFlowError("找回申请返回无效数据，请重试");
  return { message: data.message, resendAfterSeconds: data.resendAfterSeconds };
}
export async function resetPassword(
  input: { token: string; newPassword: string },
  options?: RequestOptions,
): Promise<void> {
  const generation = useAuthStore.getState().authGeneration;
  const data = record(await postAuth("reset-password", input, options));
  if (typeof data.message !== "string")
    throw new AuthFlowError("重置服务返回无效数据，请重试");
  assertCurrentAuthentication(generation, options?.signal);
  useAuthStore.getState().clearAuthentication();
  window.dispatchEvent(new Event("booksoul:auth-invalidated"));
}

export async function claimCurrentGuest(sessionId: string): Promise<void> {
  const auth = useAuthStore.getState();
  if (!auth.user) return;
  auth.setClaimState("claiming");
  try {
    const response = await apiFetch("/api/auth/claim-guest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Guest-User-Id": auth.guestUserId,
      },
      body: JSON.stringify({
        guestUserId: auth.guestUserId,
        sessionId,
      }),
      skipRefresh: false,
    });
    if (response.status === 404) {
      auth.completeClaim();
      return;
    }
    if (!response.ok) throw new Error(await readApiError(response));
    const result = (await response.json()) as {
      data: { status: "completed" | "partial" | "already_claimed" };
    };
    if (result.data.status === "partial") {
      auth.setClaimState("partial", "部分记忆尚未迁移，可稍后重试");
    } else {
      auth.completeClaim();
    }
  } catch (error) {
    auth.setClaimState(
      "failed",
      error instanceof Error ? error.message : "认领失败，可稍后重试",
    );
  }
}

export async function logoutCurrentDevice(): Promise<void> {
  const auth = useAuthStore.getState();
  if (!auth.user) return;
  const response = await apiFetch("/api/auth/logout", {
    method: "POST",
    skipRefresh: true,
  });
  if (!response.ok) throw new Error(await readApiError(response));
  useAuthStore.getState().clearAuthentication();
  window.dispatchEvent(new Event("booksoul:auth-invalidated"));
}
