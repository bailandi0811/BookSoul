import { apiFetch, readApiError, refreshAuthentication } from "./api";
import { useAuthStore, type AuthTokens } from "@/store/useAuthStore";

type AuthMode = "login" | "register";
export type AuthRestoreStatus = "authenticated" | "guest" | "unavailable";

export async function authenticate(
  mode: AuthMode,
  input: { email: string; password: string; name?: string },
): Promise<AuthTokens> {
  const response = await apiFetch(`/api/auth/${mode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    skipAuth: true,
    skipRefresh: true,
  });
  if (!response.ok) throw new Error(await readApiError(response));
  const result = (await response.json()) as { success: true; data: AuthTokens };
  useAuthStore.getState().signIn(result.data);
  return result.data;
}

export async function restoreAuthentication(): Promise<AuthRestoreStatus> {
  const existing = useAuthStore.getState();

  try {
    if (existing.user && existing.accessToken) {
      const response = await apiFetch("/api/auth/me");
      if (response.ok) {
        const result = (await response.json()) as {
          success: true;
          data: { user: AuthTokens["user"] };
        };
        const accessToken = useAuthStore.getState().accessToken;
        if (!accessToken) return "guest";
        useAuthStore.getState().restoreSession({
          accessToken,
          user: result.data.user,
        });
        return "authenticated";
      }
      return response.status === 401 ? "guest" : "unavailable";
    }

    const refreshStatus = await refreshAuthentication();
    if (refreshStatus === "authenticated") return "authenticated";
    return refreshStatus === "unauthorized" ? "guest" : "unavailable";
  } catch {
    return "unavailable";
  }
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
