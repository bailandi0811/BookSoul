import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  AnimatePresence,
  motion,
  useIsPresent,
  useReducedMotion,
} from "framer-motion";
import {
  PAPER_EASE,
  PANEL_DURATION,
  PANEL_EXIT_DURATION,
} from "@/lib/ui-motion";
import { useDialogFocus } from "./useDialogFocus";

export function Dialog({
  title,
  children,
  onClose,
  wide = false,
  open = true,
  id,
  descriptionId,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  open?: boolean;
  id?: string;
  descriptionId?: string;
  className?: string;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <DialogPanel
          key="panel"
          title={title}
          onClose={onClose}
          wide={wide}
          id={id}
          descriptionId={descriptionId}
          className={className}
        >
          {children}
        </DialogPanel>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function DialogPanel({
  title,
  children,
  onClose,
  wide,
  id,
  descriptionId,
  className,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide: boolean;
  id?: string;
  descriptionId?: string;
  className: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const present = useIsPresent();
  const reducedMotion = useReducedMotion();
  useDialogFocus(ref, onClose, present);
  return (
    <motion.div
      className="dialog-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reducedMotion ? 0 : PANEL_EXIT_DURATION }}
      inert={!present}
    >
      <button
        type="button"
        className="dialog-scrim"
        aria-label={`关闭${title}`}
        onClick={onClose}
      />
      <motion.div
        ref={ref}
        id={id}
        role={present ? "dialog" : undefined}
        aria-modal={present ? true : undefined}
        aria-hidden={!present}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        initial={reducedMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
        animate={{
          opacity: 1,
          y: 0,
          scale: 1,
          transition: {
            duration: reducedMotion ? 0 : PANEL_DURATION,
            ease: PAPER_EASE,
          },
        }}
        exit={{
          opacity: 0,
          y: reducedMotion ? 0 : 6,
          scale: reducedMotion ? 1 : 0.99,
          transition: {
            duration: reducedMotion ? 0 : PANEL_EXIT_DURATION,
            ease: PAPER_EASE,
          },
        }}
        className={`paper-dialog ${wide ? "paper-dialog-wide" : ""} ${className}`}
      >
        <div className="dialog-heading">
          <h2 id={titleId} className="font-display">
            {title}
          </h2>
          <button
            type="button"
            className="dialog-close"
            aria-label="关闭"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}
