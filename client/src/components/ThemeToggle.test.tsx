import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { ThemeToggle } from "./ThemeToggle";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const container = document.createElement("div");
document.body.append(container);
const root = createRoot(container);
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  localStorage.clear();
});

it("keeps header and drawer theme controls in sync and restores the choice after remount", async () => {
  await act(async () =>
    root.render(
      <>
        <ThemeToggle />
        <ThemeToggle />
      </>,
    ),
  );
  const first = container.querySelector("button")!;
  const initial = first.getAttribute("aria-label");
  await act(async () => first.click());
  const controls = [...container.querySelectorAll("button")];
  expect(controls[0].getAttribute("aria-label")).not.toBe(initial);
  expect(controls[1].getAttribute("aria-label")).toBe(
    controls[0].getAttribute("aria-label"),
  );
  expect(document.documentElement.classList.contains("dark")).toBe(
    localStorage.getItem("booksoul_theme") === "dark",
  );
  await act(async () => root.render(<ThemeToggle key="new-page" />));
  expect(container.querySelector("button")!.getAttribute("aria-label")).toBe(
    controls[0].getAttribute("aria-label"),
  );
});
