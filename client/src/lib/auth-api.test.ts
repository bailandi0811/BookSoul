import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/store/useAuthStore";
import { logoutCurrentDevice, restoreAuthentication } from "./auth-api";

const user = {
  id: "user-1",
  email: "reader@example.com",
  name: "读者",
};

describe("auth session lifecycle", () => {
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
});
