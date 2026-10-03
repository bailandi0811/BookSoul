import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import {
  PAPER_EASE,
  PANEL_DURATION,
  PANEL_EXIT_DURATION,
} from "@/lib/ui-motion";

type SelectOption = { value: string; label: string };
type Placement = {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
  above: boolean;
};

export function Select({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const scrollActive = useRef(true);
  const search = useRef({ text: "", time: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const reducedMotion = useReducedMotion();
  const selected = options.findIndex((option) => option.value === value);

  function show() {
    if (disabled || !options.length) return;
    scrollActive.current = true;
    setActive(Math.max(0, selected));
    setOpen(true);
  }
  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const below = innerHeight - rect.bottom - 14;
      const above = rect.top - 14;
      const placeAbove = below < 180 && above > below;
      const width = Math.min(rect.width, innerWidth - 24);
      setPlacement({
        width,
        left: Math.max(12, Math.min(rect.left, innerWidth - width - 12)),
        maxHeight: Math.max(0, Math.min(280, placeAbove ? above : below)),
        ...(placeAbove
          ? { bottom: innerHeight - rect.top + 6 }
          : { top: rect.bottom + 6 }),
        above: placeAbove,
      });
    };
    update();
    const scroll = (event: Event) => {
      if (event.target instanceof Node && list.current?.contains(event.target))
        return;
      update();
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", scroll, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !placement || !scrollActive.current) return;
    const viewport = list.current;
    const option =
      viewport?.querySelectorAll<HTMLElement>('[role="option"]')[active];
    if (viewport && option)
      viewport.scrollTop =
        option.offsetTop - (viewport.clientHeight - option.offsetHeight) / 2;
  }, [open, active, placement]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !trigger.current?.contains(event.target) &&
        !list.current?.contains(event.target)
      )
        setOpen(false);
    };
    window.addEventListener("pointerdown", outside);
    return () => window.removeEventListener("pointerdown", outside);
  }, [open]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (!open) {
        show();
        return;
      }
      scrollActive.current = true;
      setActive((current) =>
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? options.length - 1
            : Math.max(
                0,
                Math.min(
                  options.length - 1,
                  current + (event.key === "ArrowDown" ? 1 : -1),
                ),
              ),
      );
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(active);
      else show();
    } else if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const now = Date.now();
      search.current = {
        text:
          (now - search.current.time < 700 ? search.current.text : "") +
          event.key.toLocaleLowerCase(),
        time: now,
      };
      const match = options.findIndex((option) =>
        option.label.toLocaleLowerCase().includes(search.current.text),
      );
      if (match >= 0) {
        scrollActive.current = true;
        setActive(match);
        setOpen(true);
      }
    }
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={id}
        aria-activedescendant={open ? `${id}-option-${active}` : undefined}
        disabled={disabled || !options.length}
        className={`paper-select ${open ? "is-open" : ""}`}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        onBlur={(event) => {
          if (!list.current?.contains(event.relatedTarget as Node | null))
            setOpen(false);
        }}
      >
        <span className="paper-select-value">
          {options[selected]?.label ?? "请选择"}
        </span>
        <motion.span
          className="paper-select-chevron"
          animate={{ rotate: open ? 180 : 0 }}
          transition={{
            duration: reducedMotion ? 0 : PANEL_DURATION,
            ease: PAPER_EASE,
          }}
        >
          <ChevronDown size={16} strokeWidth={1.5} />
        </motion.span>
      </button>
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && placement && (
              <motion.div
                key="list"
                ref={list}
                id={id}
                role="listbox"
                aria-label={label}
                className="paper-select-list"
                style={{
                  position: "fixed",
                  left: placement.left,
                  top: placement.top,
                  bottom: placement.bottom,
                  width: placement.width,
                  maxHeight: placement.maxHeight,
                  transformOrigin: placement.above
                    ? "bottom center"
                    : "top center",
                }}
                initial={
                  reducedMotion
                    ? false
                    : { opacity: 0, y: placement.above ? -5 : 5, scale: 0.98 }
                }
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{
                  opacity: 0,
                  y: reducedMotion ? 0 : placement.above ? -3 : 3,
                  scale: reducedMotion ? 1 : 0.99,
                }}
                transition={{
                  duration: reducedMotion ? 0 : PANEL_EXIT_DURATION,
                  ease: PAPER_EASE,
                }}
              >
                {options.map((option, index) => (
                  <button
                    key={option.value}
                    id={`${id}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    tabIndex={-1}
                    className={`paper-select-option ${index === active ? "is-highlighted" : ""}`}
                    onPointerDown={(event) => event.preventDefault()}
                    onPointerMove={() => {
                      scrollActive.current = false;
                      setActive(index);
                    }}
                    onClick={() => choose(index)}
                  >
                    <span>{option.label}</span>
                    {option.value === value && (
                      <Check size={16} strokeWidth={1.6} />
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
