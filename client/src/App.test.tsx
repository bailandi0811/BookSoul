import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import { useAuthStore } from "./store/useAuthStore";
import { useBooksStore } from "./store/useBooksStore";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
describe("reset route precedence and URL cleanup", () => {
  it("captures an invalid hashchange and prevents a late me response from overwriting the account", async () => {
    const user = {
      id: "fixture",
      email: "reader@example.invalid",
      name: "Reader",
      emailVerifiedAt: null,
    };
    useAuthStore.getState().signIn({ accessToken: "original", user });
    history.replaceState(null, "", "/");
    let finish!: (response: Response) => void;
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<App />));
      await act(async () => {
        history.replaceState(null, "", "/#reset-password?token=invalid");
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      });
      expect(container.textContent).toContain("重置链接无效");
      expect(window.location.hash).toBe("");
      await act(async () =>
        finish(
          new Response(
            JSON.stringify({
              success: true,
              data: { user: { ...user, name: "Late" } },
            }),
          ),
        ),
      );
      expect(useAuthStore.getState().user?.name).toBe("Reader");
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      fetch.mockRestore();
      history.replaceState(null, "", "/");
    }
  });
  it("provides login and reapplication after an invalid link without invalidating the existing account", async () => {
    const user = {
      id: "fixture",
      email: "reader@example.invalid",
      name: "Reader",
      emailVerifiedAt: null,
    };
    useAuthStore.getState().signIn({ accessToken: "original", user });
    history.replaceState(null, "", "/#reset-password?token=invalid");
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, data: { user, books: [] } }),
        ),
      );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<App />));
      expect(container.textContent).toContain("重置链接无效");
      await act(async () => {
        [...container.querySelectorAll("button")]
          .find((button) => button.textContent?.includes("重新申请"))!
          .click();
      });
      expect(container.textContent).toContain("忘记密码");
      expect(container.querySelector('input[type="email"]')).not.toBeNull();
      expect(useAuthStore.getState().accessToken).toBe("original");
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      container.remove();
      fetch.mockRestore();
      history.replaceState(null, "", "/");
    }
  });
  it("keeps reset usable in StrictMode for an authenticated user without restoring the session", async () => {
    useAuthStore.getState().signIn({
      accessToken: "original",
      user: {
        id: "fixture",
        email: "reader@example.invalid",
        name: "Reader",
      },
    });
    const token = "A".repeat(43);
    history.replaceState(null, "", "/#reset-password?token=" + token);
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 401 }));
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          <StrictMode>
            <App />
          </StrictMode>,
        ),
      );
      expect(container.textContent).toContain("设置新密码");
      expect(window.location.hash).toBe("");
      expect(fetch).not.toHaveBeenCalled();
      expect(
        container.querySelector('input[name="new-password"]'),
      ).not.toBeNull();
      expect(localStorage.getItem("booksoul-auth")).not.toContain(token);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      fetch.mockRestore();
      history.replaceState(null, "", "/");
    }
  });
});

describe("session restoration recovery", () => {
  it("leaves a stalled restoration in StrictMode with an actionable retry", async () => {
    vi.useFakeTimers();
    useAuthStore.getState().clearAuthentication();
    history.replaceState(null, "", "/");
    let finish!: (response: Response) => void;
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise<Response>((resolve) => { finish = resolve; }),
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<StrictMode><App /></StrictMode>));
      expect(container.textContent).toContain("把小说放进一间记得每本进度的书房");
      await act(async () => {
        [...container.querySelectorAll("button")]
          .find((button) => button.textContent?.includes("开始阅读"))!
          .click();
      });
      expect(container.textContent).toContain("正在恢复会话");
      await act(async () => vi.advanceTimersByTimeAsync(10_000));
      expect(container.querySelector('[role="alert"]')).not.toBeNull();
      expect(container.textContent).not.toContain("正在恢复会话");
      const retry = [...container.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("重试"));
      expect(retry).toBeDefined();

      fetch.mockResolvedValue(new Response("{}", { status: 401 }));
      await act(async () => retry!.click());
      expect(container.querySelector('input[type="email"]')).not.toBeNull();
      expect(container.querySelector('[role="alert"]')).toBeNull();
      await act(async () => finish(new Response(JSON.stringify({
        success: true,
        data: {
          accessToken: "late",
          user: { id: "fixture", email: "reader@example.invalid", name: "Late" },
        },
      }))));
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    } finally {
      finish(new Response("{}", { status: 401 }));
      await act(async () => root.unmount());
      container.remove();
      fetch.mockRestore();
      vi.useRealTimers();
    }
  });

  it("gates private screens on restoration failure while preserving saved credentials", async () => {
    useAuthStore.getState().signIn({
      accessToken: "original",
      user: { id: "fixture", email: "reader@example.invalid", name: "Reader" },
    });
    history.replaceState(null, "", "/");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 503 }),
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<App />));
      expect(container.textContent).toContain("把小说放进一间记得每本进度的书房");
      expect(container.querySelector('[role="alert"]')).toBeNull();
      await act(async () => {
        [...container.querySelectorAll("button")]
          .find((button) => button.textContent?.includes("开始阅读"))!
          .click();
      });
      expect(container.querySelector('[role="alert"]')).not.toBeNull();
      expect(container.querySelector("button")).not.toBeNull();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(useAuthStore.getState().accessToken).toBe("original");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      fetch.mockRestore();
      useAuthStore.getState().clearAuthentication();
    }
  });
});

describe("landing entry", () => {
  const user = {
    id: "landing-fixture",
    email: "reader@example.invalid",
    name: "Reader",
    emailVerifiedAt: null,
  };

  it("shows the homepage before sending a guest reader to authentication", async () => {
    useAuthStore.getState().clearAuthentication();
    useBooksStore.getState().clearPrivateState();
    history.replaceState(null, "", "/");
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 401 }));
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<App />));
      await vi.waitFor(() => {
        expect(container.textContent).toContain("把小说放进一间记得每本进度的书房");
      });
      expect(container.querySelector('input[type="email"]')).toBeNull();

      await act(async () => {
        [...container.querySelectorAll("button")]
          .find((button) => button.textContent?.includes("开始阅读"))!
          .click();
      });

      await vi.waitFor(() => {
        expect(container.querySelector('input[type="email"]')).not.toBeNull();
      });
    } finally {
      await act(async () => root.unmount());
      container.remove();
      fetch.mockRestore();
      useAuthStore.getState().clearAuthentication();
      useBooksStore.getState().clearPrivateState();
      history.replaceState(null, "", "/");
    }
  });

  it("lets a guest return from authentication to the homepage", async () => {
    useAuthStore.getState().clearAuthentication();
    useBooksStore.getState().clearPrivateState();
    history.replaceState(null, "", "/");
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 401 }));
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<App />));
      await vi.waitFor(() => {
        expect(container.textContent).toContain("把小说放进一间记得每本进度的书房");
      });

      await act(async () => {
        [...container.querySelectorAll("button")]
          .find((button) => button.getAttribute("aria-label") === "继续阅读《长夜与春》")!
          .click();
      });

      await vi.waitFor(() => {
        expect(container.querySelector('input[type="email"]')).not.toBeNull();
      });

      await act(async () => {
        [...container.querySelectorAll("button")]
          .find((button) => button.textContent?.includes("返回首页"))!
          .click();
      });

      await vi.waitFor(() => {
        expect(container.textContent).toContain("把小说放进一间记得每本进度的书房");
      });
      expect(container.querySelector('input[type="email"]')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
      fetch.mockRestore();
      useAuthStore.getState().clearAuthentication();
      useBooksStore.getState().clearPrivateState();
      history.replaceState(null, "", "/");
    }
  });

  it("keeps a restored reader on the homepage until they enter the library", async () => {
    useAuthStore.getState().signIn({ accessToken: "fixture-access", user });
    useBooksStore.getState().clearPrivateState();
    history.replaceState(null, "", "/");
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      switch (String(url)) {
        case "/api/auth/me":
          return new Response(
            JSON.stringify({ success: true, data: { user } }),
          );
        case "/api/books":
          return new Response(
            JSON.stringify({ success: true, data: [] }),
          );
        default:
          throw new Error("Unexpected mocked request: " + String(url));
      }
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<App />));
      await vi.waitFor(() => {
        expect(container.textContent).toContain("把小说放进一间记得每本进度的书房");
      });
      await vi.waitFor(() => {
        expect(container.querySelector(".library-room")).toBeNull();
      });

      await act(async () => {
        [...container.querySelectorAll("button")]
          .find((button) => button.textContent?.includes("开始阅读"))!
          .click();
      });

      await vi.waitFor(() => {
        expect(container.querySelector(".library-room")).not.toBeNull();
      });
    } finally {
      await act(async () => root.unmount());
      container.remove();
      fetch.mockRestore();
      useAuthStore.getState().clearAuthentication();
      useBooksStore.getState().clearPrivateState();
      history.replaceState(null, "", "/");
    }
  });

  it("lets a restored reader return from the library to the homepage", async () => {
    useAuthStore.getState().signIn({ accessToken: "fixture-access", user });
    useBooksStore.getState().clearPrivateState();
    history.replaceState(null, "", "/");
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      switch (String(url)) {
        case "/api/auth/me":
          return new Response(
            JSON.stringify({ success: true, data: { user } }),
          );
        case "/api/books":
          return new Response(
            JSON.stringify({ success: true, data: [] }),
          );
        default:
          throw new Error("Unexpected mocked request: " + String(url));
      }
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<App />));
      await vi.waitFor(() => {
        expect(container.textContent).toContain("把小说放进一间记得每本进度的书房");
      });

      await act(async () => {
        [...container.querySelectorAll("button")]
          .find((button) => button.textContent?.includes("开始阅读"))!
          .click();
      });

      await vi.waitFor(() => {
        expect(container.querySelector(".library-room")).not.toBeNull();
      });

      await act(async () => {
        [...container.querySelectorAll("button")]
          .find((button) => button.textContent?.includes("返回首页"))!
          .click();
      });

      await vi.waitFor(() => {
        expect(container.textContent).toContain("把小说放进一间记得每本进度的书房");
      });
      await vi.waitFor(() => {
        expect(container.querySelector(".library-room")).toBeNull();
      });
    } finally {
      await act(async () => root.unmount());
      container.remove();
      fetch.mockRestore();
      useAuthStore.getState().clearAuthentication();
      useBooksStore.getState().clearPrivateState();
      history.replaceState(null, "", "/");
    }
  });
});
