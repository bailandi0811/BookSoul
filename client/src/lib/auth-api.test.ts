import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/store/useAuthStore";
import {
  authenticate,
  confirmCurrentUserEmail,
  logoutCurrentDevice,
  requestPasswordReset,
  requestRegistrationCode,
  resetPassword,
  restoreAuthentication,
} from "./auth-api";
import { refreshAuthentication } from "./api";

const user = {
  id: "user-1",
  email: "reader@example.com",
  name: "读者",
};

describe("auth session lifecycle", () => {
  it("invalidates private caches when explicitly logging into a different account", async () => {
    useAuthStore.getState().signIn({ accessToken: "original", user });
    const listener = vi.fn();
    window.addEventListener("booksoul:auth-invalidated", listener);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { accessToken: "new", user: { ...user, id: "other" } },
        }),
      ),
    );
    try {
      await authenticate("login", {
        email: "other@example.invalid",
        password: "password123",
      });
      expect(listener).toHaveBeenCalledTimes(1);
      expect(useAuthStore.getState().user?.id).toBe("other");
    } finally {
      window.removeEventListener("booksoul:auth-invalidated", listener);
    }
  });
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useAuthStore.getState().clearAuthentication();
  });

  it("restores a cookie-only session by rotating its refresh token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { accessToken: "restored-access", user },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(restoreAuthentication()).resolves.toBe("authenticated");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/refresh",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      accessToken: "restored-access",
      user: { id: "user-1" },
    });
  });

  it("uses one refresh when cookie-only session restoration runs concurrently", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { accessToken: "restored-access", user },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      Promise.all([restoreAuthentication(), restoreAuthentication()]),
    ).resolves.toEqual(["authenticated", "authenticated"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      accessToken: "restored-access",
      user: { id: "user-1" },
    });
  });

  it("keeps a stable guest identity when no refresh cookie exists", async () => {
    const guestUserId = useAuthStore.getState().guestUserId;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 401 }),
    );

    await expect(restoreAuthentication()).resolves.toBe("guest");

    expect(useAuthStore.getState().guestUserId).toBe(guestUserId);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("does not claim logout succeeded when the server rejects it", async () => {
    useAuthStore.getState().signIn({ accessToken: "access", user });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "服务暂不可用" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(logoutCurrentDevice()).rejects.toThrow("服务暂不可用");

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      accessToken: "access",
      user: { id: "user-1" },
    });
  });

  it("clears local account data after the server confirms logout", async () => {
    useAuthStore.getState().signIn({ accessToken: "access", user });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await logoutCurrentDevice();

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      accessToken: null,
      user: null,
    });
  });

  it("uses public endpoints without credentials and retains structured cooldown errors", async () => {
    useAuthStore.getState().signIn({ accessToken: "existing", user });
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              verificationId: "receipt",
              expiresInSeconds: 600,
              resendAfterSeconds: 60,
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: "AUTH_RATE_LIMITED",
            message: "请稍后",
            retryAfterSeconds: 37,
          }),
          { status: 429 },
        ),
      );
    expect(await requestRegistrationCode(user.email)).toMatchObject({
      verificationId: "receipt",
    });
    expect(
      new Headers(fetch.mock.calls[0][1]?.headers).has("Authorization"),
    ).toBe(false);
    await expect(requestPasswordReset(user.email)).rejects.toMatchObject({
      code: "AUTH_RATE_LIMITED",
      retryAfterSeconds: 37,
    });
  });
  it("discards an old refresh after reset and clears private caches", async () => {
    useAuthStore.getState().signIn({ accessToken: "old", user });
    let finish!: (response: Response) => void;
    vi.spyOn(globalThis, "fetch").mockImplementation((input) =>
      String(input).endsWith("/refresh")
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(
            new Response(
              JSON.stringify({
                success: true,
                data: { message: "密码已重置，请重新登录。" },
              }),
            ),
          ),
    );
    const event = vi.fn();
    window.addEventListener("booksoul:auth-invalidated", event);
    const refreshing = refreshAuthentication();
    await vi.waitFor(() => expect(finish).toBeDefined());
    await resetPassword({ token: "t".repeat(43), newPassword: "new-password" });
    finish(
      new Response(
        JSON.stringify({ success: true, data: { accessToken: "stale", user } }),
      ),
    );
    expect(await refreshing).toBe("superseded");
    expect(useAuthStore.getState().user).toBeNull();
    expect(event).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("booksoul-auth")).not.toContain("t".repeat(43));
    window.removeEventListener("booksoul:auth-invalidated", event);
  });
  it("does not apply late login or verification responses to a changed identity", async () => {
    let finish!: (response: Response) => void;
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const login = authenticate("login", {
      email: user.email,
      password: "password123",
    });
    useAuthStore.getState().invalidatePendingAuthentication();
    finish(
      new Response(
        JSON.stringify({ success: true, data: { accessToken: "late", user } }),
      ),
    );
    await expect(login).rejects.toThrow();
    expect(useAuthStore.getState().user).toBeNull();
    useAuthStore.getState().signIn({ accessToken: "old", user });
    const confirm = confirmCurrentUserEmail({
      verificationId: "receipt",
      code: "000123",
    });
    useAuthStore
      .getState()
      .signIn({ accessToken: "new", user: { ...user, id: "other" } });
    finish(
      new Response(
        JSON.stringify({
          success: true,
          data: { user: { ...user, emailVerifiedAt: "2026-10-02T00:00:00Z" } },
        }),
      ),
    );
    await expect(confirm).rejects.toThrow();
    expect(useAuthStore.getState().user?.id).toBe("other");
  });
});

describe("session restoration failures", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    useAuthStore.getState().signIn({ accessToken: "original", user });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    useAuthStore.getState().clearAuthentication();
  });

  it("bounds a stalled me request and ignores its late user response", async () => {
    let finish!: (response: Response) => void;
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise<Response>((resolve) => { finish = resolve; }),
    );
    let status = "pending";
    const pending = restoreAuthentication().then((result) => { status = result; });
    try {
      await vi.advanceTimersByTimeAsync(10_000);
      expect(status).toBe("unavailable");
      expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
      expect(useAuthStore.getState().accessToken).toBe("original");
    } finally {
      finish(new Response(JSON.stringify({
        success: true,
        data: { user: { ...user, name: "Late" } },
      })));
      await pending;
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(useAuthStore.getState().user?.name).toBe("读者");
  });

  it("includes response body reading in the restoration deadline", async () => {
    let finishBody!: (payload: unknown) => void;
    const response = new Response("{}");
    vi.spyOn(response, "json").mockImplementation(
      () => new Promise((resolve) => { finishBody = resolve; }),
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    let status = "pending";
    const pending = restoreAuthentication().then((result) => { status = result; });
    try {
      await vi.advanceTimersByTimeAsync(10_000);
      expect(status).toBe("unavailable");
    } finally {
      finishBody({ success: true, data: { user: { ...user, name: "Late" } } });
      await pending;
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(useAuthStore.getState().user?.name).toBe("读者");
  });

  it("reports unavailable when renewing an expired access token fails temporarily", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      new Response("{}", { status: String(input).endsWith("/refresh") ? 503 : 401 }),
    );
    expect(await restoreAuthentication()).toBe("unavailable");
    expect(useAuthStore.getState().accessToken).toBe("original");
  });
});
