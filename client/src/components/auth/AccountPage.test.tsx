import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AccountPage } from "./AccountPage";
import { useAuthStore } from "@/store/useAuthStore";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const user = {
  id: "account-fixture",
  name: "书友",
  email: "reader@example.invalid",
  emailVerifiedAt: "2026-10-03T00:00:00Z",
};
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  useAuthStore.getState().signIn({ accessToken: "fixture-only", user });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  useAuthStore.getState().clearAuthentication();
  vi.restoreAllMocks();
});
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find((item) =>
    item.textContent?.includes(text),
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
}
it("shows actual account details, opens appearance controls and prefills recovery without sending email", async () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  const back = vi.fn();
  await act(async () => root.render(<AccountPage onBack={back} />));
  expect(container.querySelector("header")?.textContent).not.toContain(
    user.email,
  );
  expect(container.querySelector("h1")?.textContent).toBe("你的账号");
  expect(container.textContent).toContain(user.email);
  expect(container.textContent).toContain("已验证");
  await click("背景与主题");
  expect(container.querySelector("details")?.open).toBe(true);
  await click("找回密码");
  expect(
    [...document.body.querySelectorAll('[role="dialog"] h2')].map(
      (heading) => heading.textContent,
    ),
  ).toEqual(["找回密码"]);
  expect(
    document.body
      .querySelector('[role="dialog"] input[type="email"]')
      ?.getAttribute("type"),
  ).toBe("email");
  expect(
    (
      document.body.querySelector(
        '[role="dialog"] input[type="email"]',
      ) as HTMLInputElement
    ).value,
  ).toBe(user.email);
  expect(fetch).not.toHaveBeenCalled();
  await act(async () =>
    document.body
      .querySelector<HTMLButtonElement>('[aria-label="关闭"]')!
      .click(),
  );
  await click("返回书库");
  expect(back).toHaveBeenCalledOnce();
});
it("keeps the account usable when logout fails, then clears authentication after a successful retry", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response("{}", { status: 503 }));
  await act(async () => root.render(<AccountPage onBack={() => {}} />));
  await click("退出登录");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "退出失败",
  );
  expect(useAuthStore.getState().accessToken).toBe("fixture-only");
  fetch.mockResolvedValue(new Response("{}", { status: 200 }));
  await click("退出登录");
  expect(useAuthStore.getState().user).toBeNull();
});
