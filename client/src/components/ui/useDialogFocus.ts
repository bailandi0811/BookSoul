import { useEffect, useEffectEvent, type RefObject } from "react";

export function useDialogFocus(
  ref: RefObject<HTMLDivElement | null>,
  onClose: () => void,
  active = true,
) {
  const close = useEffectEvent(onClose);
  useEffect(() => {
    if (!active) return;
    const panel = ref.current;
    const previousFocus = document.activeElement;
    const app = document.getElementById("root");
    const previousInert = app?.inert ?? false;
    const overflow = document.body.style.overflow;
    if (app) app.inert = true;
    document.body.style.overflow = "hidden";
    panel?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      const dialogs = [
        ...document.querySelectorAll('[role="dialog"][aria-modal="true"]'),
      ];
      if (dialogs[dialogs.length - 1] !== panel) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
      if (event.key !== "Tab" || !panel) return;
      const controls = [
        ...panel.querySelectorAll<HTMLElement>(
          'button, input, select, textarea, a[href], [tabindex="0"]',
        ),
      ].filter(
        (item) =>
          !item.matches(":disabled") &&
          item.tabIndex >= 0 &&
          item.getClientRects().length > 0,
      );
      const first = controls[0],
        last = controls[controls.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !panel.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !panel.contains(document.activeElement))
      ) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (app) app.inert = previousInert;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, [ref, active]);
}
