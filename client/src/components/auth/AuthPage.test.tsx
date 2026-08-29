import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AuthPage } from "./AuthPage";

describe("AuthPage", () => {
  it("renders empty, autofill-resistant credential fields", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(
      <AuthPage onAuthenticated={vi.fn()} />,
    );

    const form = container.querySelector("form");
    const email = container.querySelector<HTMLInputElement>(
      'input[type="email"]',
    );
    const password = container.querySelector<HTMLInputElement>(
      'input[type="password"]',
    );

    expect(form?.getAttribute("autocomplete")).toBe("off");
    expect(email).toMatchObject({ value: "", readOnly: true });
    expect(email?.getAttribute("autocomplete")).toBe("off");
    expect(email?.getAttribute("placeholder")).toBe("reader@example.com");
    expect(password).toMatchObject({ value: "", readOnly: true });
    expect(password?.getAttribute("autocomplete")).toBe("new-password");
    expect(password?.getAttribute("placeholder")).toBe("输入密码");
  });
});
