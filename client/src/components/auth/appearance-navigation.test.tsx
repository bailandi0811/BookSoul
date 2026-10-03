import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { AuthPage } from "./AuthPage";
import { ResetPasswordPage } from "./ResetPasswordPage";

it("preserves a selected scene and independent theme when moving between authentication pages", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<AuthPage onAuthenticated={() => {}} />));
    const background = container.querySelector<HTMLElement>(
      '[aria-label="选择背景"]',
    );
    expect(background).not.toBeNull();
    await act(async () => background!.click());
    const city = container.querySelector<HTMLInputElement>(
      'input[value="city"]',
    )!;
    expect(city).not.toBeNull();
    await act(async () => city.click());
    const theme =
      container.querySelector<HTMLButtonElement>('[aria-label*="主题"]')!;
    await act(async () => theme.click());
    const savedTheme = localStorage.getItem("booksoul_theme");
    expect(localStorage.getItem("booksoul_background")).toBe("city");
    await act(async () =>
      root.render(
        <ResetPasswordPage
          token={null}
          onComplete={() => {}}
          onExit={() => {}}
        />,
      ),
    );
    await act(async () =>
      container.querySelector<HTMLElement>('[aria-label="选择背景"]')!.click(),
    );
    expect(
      container.querySelector<HTMLInputElement>('input[value="city"]')?.checked,
    ).toBe(true);
    expect(localStorage.getItem("booksoul_theme")).toBe(savedTheme);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
  }
});
