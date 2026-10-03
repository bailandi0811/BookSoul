import {
  useAuthStore,
  type AuthTokens,
  type AuthUser,
} from "@/store/useAuthStore";
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("认证服务返回无效数据，请重试");
  return value as Record<string, unknown>;
}
export function parseAuthUser(value: unknown): AuthUser {
  const user = record(value);
  if (
    typeof user.id !== "string" ||
    !user.id ||
    typeof user.email !== "string" ||
    typeof user.name !== "string" ||
    (user.emailVerifiedAt != null &&
      (typeof user.emailVerifiedAt !== "string" ||
        !Number.isFinite(Date.parse(user.emailVerifiedAt))))
  )
    throw new Error("认证服务返回无效用户，请重试");
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerifiedAt:
      typeof user.emailVerifiedAt === "string" ? user.emailVerifiedAt : null,
  };
}
export function parseAuthTokens(value: unknown): AuthTokens {
  const data = record(value);
  if (typeof data.accessToken !== "string" || !data.accessToken)
    throw new Error("认证服务返回无效凭证，请重试");
  return { accessToken: data.accessToken, user: parseAuthUser(data.user) };
}
export function successData(value: unknown): unknown {
  const payload = record(value);
  if (payload.success !== true || !("data" in payload))
    throw new Error("认证服务返回无效数据，请重试");
  return payload.data;
}
export function assertCurrentAuthentication(
  generation: number,
  signal?: AbortSignal,
): void {
  if (signal?.aborted) throw new DOMException("操作已取消", "AbortError");
  if (useAuthStore.getState().authGeneration !== generation)
    throw new DOMException("会话已变化，请重试", "AbortError");
}
