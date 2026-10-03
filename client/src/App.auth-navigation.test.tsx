import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { useAuthStore } from "./store/useAuthStore";
import { useBooksStore } from "./store/useBooksStore";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const user = {
  id: "navigation-fixture",
  email: "reader@example.invalid",
  name: "Reader",
  emailVerifiedAt: null,
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: true, data }), { status });
let container: HTMLDivElement;
let root: Root;

async function input(selector: string, value: string) {
  const field = container.querySelector<HTMLInputElement>(selector)!;
  await act(async () => {
    field.dispatchEvent(new Event("focusin", { bubbles: true }));
  });
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find(
    (item) => item.textContent === label || item.getAttribute("aria-label") === label,
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
}

async function submit() {
  await act(async () => {
    container.querySelector("form")!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}

async function expectScreen(selector: string, absentSelector?: string) {
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(container.querySelector(selector)).not.toBeNull();
    if (absentSelector) expect(container.querySelector(absentSelector)).toBeNull();
  });
}

describe("authentication navigation", () => {
  beforeEach(() => {
    useAuthStore.getState().clearAuthentication();
    useBooksStore.getState().clearPrivateState();
    history.replaceState(null, "", "/#account");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      switch (String(url)) {
        case "/api/auth/refresh":
          return new Response("{}", { status: 401 });
        case "/api/auth/me":
          return json({ user });
        case "/api/auth/login":
        case "/api/auth/register":
          return json({ accessToken: "fixture-access", user });
        case "/api/auth/registration-code":
          return json({
            verificationId: "fixture-receipt",
            expiresInSeconds: 600,
            resendAfterSeconds: 60,
          }, 202);
        case "/api/auth/logout":
          return json({});
        case "/api/books":
          return json({ books: [] });
        default:
          throw new Error("Unexpected mocked request: " + String(url));
      }
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    useAuthStore.getState().clearAuthentication();
    useBooksStore.getState().clearPrivateState();
    history.replaceState(null, "", "/");
    vi.restoreAllMocks();
  });

  it.each(["login", "register"])(
    "returns to the library after %s with a leftover account URL",
    async (mode) => {
      await act(async () => root.render(<StrictMode><App /></StrictMode>));
      if (mode === "register") {
        await click("注册");
        await input('input[name="booksoul-display-name"]', "Reader");
      }
      await input('input[type="email"]', user.email);
      await input('input[type="password"]', "fixture-password");
      if (mode === "register") {
        await click("发送验证码");
        await input('input[name="verification-code"]', "000123");
      }
      await submit();

      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(window.location.hash).toBe("");
      await expectScreen(".library-room", ".account-page");
    },
  );

  it("returns to the library after logging out of account settings and signing in again", async () => {
    useAuthStore.getState().signIn({ accessToken: "fixture-access", user });
    await act(async () => root.render(<App />));
    await expectScreen(".account-page");
    await click("退出登录");
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    await input('input[type="email"]', user.email);
    await input('input[type="password"]', "fixture-password");
    await submit();

    expect(window.location.hash).toBe("");
    await expectScreen(".library-room", ".account-page");
  });

  it("preserves the account page when restoring an existing session", async () => {
    useAuthStore.getState().signIn({ accessToken: "fixture-access", user });
    await act(async () => root.render(<StrictMode><App /></StrictMode>));
    await expectScreen(".account-page");
    expect(window.location.hash).toBe("#account");
    expect(container.querySelector(".library-room")).toBeNull();
  });

  it("does not sign in or navigate when switching forms cancels a pending login", async () => {
    await act(async () => root.render(<App />));
    let finishLogin!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>((resolve) => {
      finishLogin = resolve;
    }));
    await input('input[type="email"]', user.email);
    await input('input[type="password"]', "fixture-password");
    await submit();
    await click("注册");
    await act(async () => finishLogin(json({ accessToken: "late-access", user })));

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(window.location.hash).toBe("#account");
    expect(container.querySelector('input[name="booksoul-display-name"]')).not.toBeNull();
    expect(container.querySelector(".library-room")).toBeNull();
  });
});
