import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthPage } from "./AuthPage";
import { ResetPasswordPage } from "./ResetPasswordPage";
import { AccountSection } from "./AccountSection";
import { AccountPage } from "./AccountPage";
import { useAuthStore } from "@/store/useAuthStore";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let container: HTMLDivElement;
const user = {
  id: "fixture",
  email: "reader@example.invalid",
  name: "Reader",
  emailVerifiedAt: null,
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: true, data }), { status });
async function click(text: string) {
  const button = [...document.body.querySelectorAll("button")].find((item) =>
    item.textContent?.includes(text),
  );
  if (!button) throw new Error("Missing button: " + text);
  await act(async () => {
    button.click();
  });
}
async function input(selector: string, value: string) {
  const field = document.body.querySelector<HTMLInputElement>(selector);
  if (!field) throw new Error("Missing field: " + selector);
  await act(async () => {
    field.dispatchEvent(new Event("focusin", { bubbles: true }));
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () => {
    document.body
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}
describe("authentication page flows with real API wrappers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().clearAuthentication();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });
  it("shows wrong and expired codes without submitting expired proofs", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-03T00:00:00Z"));
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url) =>
        String(url).endsWith("/registration-code")
          ? json(
              {
                verificationId: "receipt",
                expiresInSeconds: 600,
                resendAfterSeconds: 60,
              },
              202,
            )
          : new Response(
              JSON.stringify({
                code: "INVALID_VERIFICATION_CODE",
                message: "验证码无效或已过期，请重新申请",
              }),
              { status: 400 },
            ),
      );
    await act(async () => root.render(<AuthPage onAuthenticated={vi.fn()} onBackHome={() => {}} />));
    await click("注册");
    await input('input[name="booksoul-display-name"]', "Reader");
    await input('input[type="email"]', user.email);
    await input('input[type="password"]', "password123");
    await click("发送验证码");
    await input('input[name="verification-code"]', "000123");
    await submit();
    expect(container.textContent).toContain("验证码无效或已过期");
    expect(useAuthStore.getState().user).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(600_000);
    });
    const calls = fetch.mock.calls.length;
    await submit();
    expect(fetch).toHaveBeenCalledTimes(calls);
    expect(container.textContent).toContain("验证码已过期");
  });
  it("honors the server cooldown on a 429 and resumes using the deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-03T00:00:00Z"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "AUTH_RATE_LIMITED",
          message: "发送过于频繁，请稍后重试",
          retryAfterSeconds: 37,
        }),
        { status: 429 },
      ),
    );
    await act(async () => root.render(<AuthPage onAuthenticated={vi.fn()} onBackHome={() => {}} />));
    await click("注册");
    await input('input[type="email"]', user.email);
    await click("发送验证码");
    const resend = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("37 秒后重发"),
    );
    expect(resend?.disabled).toBe(true);
    expect(container.textContent).toContain("发送过于频繁");
    await act(async () => {
      vi.advanceTimersByTime(37_000);
    });
    expect(
      [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "发送验证码",
      )?.disabled,
    ).toBe(false);
  });
  it("keeps OTP leading zeroes, invalidates proof on email change and registers after a new receipt", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url) =>
        String(url).endsWith("registration-code")
          ? json(
              {
                verificationId: "receipt",
                expiresInSeconds: 600,
                resendAfterSeconds: 60,
              },
              202,
            )
          : json(
              {
                accessToken: "access",
                user: { ...user, emailVerifiedAt: "2026-10-02T00:00:00Z" },
              },
              201,
            ),
      );
    const done = vi.fn();
    await act(async () => root.render(<AuthPage onAuthenticated={done} onBackHome={() => {}} />));
    await click("注册");
    await input('input[name="booksoul-display-name"]', "Reader");
    await input('input[type="email"]', user.email);
    await input('input[type="password"]', "password123");
    await click("发送验证码");
    await input('input[name="verification-code"]', "000123");
    await input('input[type="email"]', "other@example.invalid");
    await submit();
    expect(
      fetch.mock.calls.filter(([url]) => String(url).endsWith("/register")),
    ).toHaveLength(0);
    await click("发送验证码");
    await input('input[name="verification-code"]', "000123");
    await submit();
    const registration = fetch.mock.calls.find(([url]) =>
      String(url).endsWith("/register"),
    );
    expect(JSON.parse(String(registration?.[1]?.body))).toMatchObject({
      code: "000123",
      verificationId: "receipt",
      email: "other@example.invalid",
    });
    expect(done).toHaveBeenCalledTimes(1);
  });
  it("allows an unverified legacy user to verify without replacing credentials", async () => {
    useAuthStore.getState().signIn({ accessToken: "original", user });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
      String(url).endsWith("/code")
        ? json(
            {
              verificationId: "receipt",
              expiresInSeconds: 600,
              resendAfterSeconds: 60,
            },
            202,
          )
        : json({ user: { ...user, emailVerifiedAt: "2026-10-02T00:00:00Z" } }),
    );
    await act(async () => root.render(<AccountSection />));
    expect(container.textContent).not.toContain(user.email);
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="账号设置"]')!
        .click(),
    );
    expect(window.location.hash).toBe("#account");
    history.replaceState(null, "", "/");
    await act(async () => root.render(<AccountPage onBack={() => {}} />));
    expect(
      document.body.querySelector('[aria-label="退出登录"]'),
    ).not.toBeNull();
    await click("补验证");
    await click("发送验证码");
    await input('input[name="verification-code"]', "000123");
    await submit();
    expect(useAuthStore.getState().user?.id).toBe(user.id);
    expect(useAuthStore.getState().accessToken).toBe("original");
    expect(container.textContent).toContain("已验证");
  });

  it.each(["email-return", "mode-return"])(
    "does not resurrect a proof after %s",
    async (transition) => {
      const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (url) =>
          String(url).endsWith("/registration-code")
            ? json(
                {
                  verificationId: "receipt",
                  expiresInSeconds: 600,
                  resendAfterSeconds: 60,
                },
                202,
              )
            : json({ accessToken: "access", user }, 201),
        );
      await act(async () =>
        root.render(<AuthPage onAuthenticated={vi.fn()} onBackHome={() => {}} />),
      );
      await click("注册");
      await input('input[name="booksoul-display-name"]', "Reader");
      await input('input[type="email"]', user.email);
      await input('input[type="password"]', "password123");
      await click("发送验证码");
      await input('input[name="verification-code"]', "000123");
      if (transition === "email-return") {
        await input('input[type="email"]', "other@example.invalid");
        await input('input[type="email"]', user.email);
      } else {
        await click("登录");
        await click("注册");
        await input('input[name="booksoul-display-name"]', "Reader");
        await input('input[type="email"]', user.email);
        await input('input[type="password"]', "password123");
      }
      expect(
        container.querySelector<HTMLInputElement>(
          'input[name="verification-code"]',
        )?.value,
      ).toBe("");
      await submit();
      expect(
        fetch.mock.calls.filter(([url]) => String(url).endsWith("/register")),
      ).toHaveLength(0);
    },
  );
  it("shows uniform forgot-password acknowledgement and actionable configuration errors", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json(
        {
          message: "如果该邮箱已注册，将收到重置邮件，请检查邮箱或稍后重试。",
          resendAfterSeconds: 60,
        },
        202,
      ),
    );
    await act(async () => root.render(<AuthPage onAuthenticated={vi.fn()} onBackHome={() => {}} />));
    await click("忘记密码");
    await input('input[type="email"]', user.email);
    await submit();
    expect(container.textContent).toContain("如果该邮箱已注册");
    expect(fetch.mock.calls[0][0]).toBe("/api/auth/forgot-password");
    await click("返回登录");
    await click("忘记密码");
    fetch.mockResolvedValue(
      new Response(JSON.stringify({ message: "认证邮件尚未配置" }), {
        status: 503,
      }),
    );
    await input('input[type="email"]', user.email);
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "尚未配置",
    );
  });
  it("does not submit on render or mismatch and clears authentication only after reset success", async () => {
    useAuthStore.getState().signIn({ accessToken: "original", user });
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(json({ message: "密码已重置，请重新登录。" }));
    const done = vi.fn();
    await act(async () =>
      root.render(
        <ResetPasswordPage
          token={"t".repeat(43)}
          onComplete={done}
          onExit={vi.fn()}
        />,
      ),
    );
    expect(fetch).not.toHaveBeenCalled();
    await input('input[name="new-password"]', "new-password");
    await input('input[name="confirm-password"]', "different");
    await submit();
    expect(fetch).not.toHaveBeenCalled();
    await input('input[name="confirm-password"]', "new-password");
    await submit();
    expect(useAuthStore.getState().user).toBeNull();
    expect(done).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("/api/auth/reset-password");
  });
});
