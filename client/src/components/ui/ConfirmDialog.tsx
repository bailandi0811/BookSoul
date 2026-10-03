import { Dialog } from "./Dialog";
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  tone = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} title={title} onClose={onCancel}>
      {description && <p className="dialog-intro">{description}</p>}
      <div className="dialog-actions">
        <button type="button" className="dialog-secondary" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`dialog-primary ${tone === "danger" ? "dialog-danger" : ""}`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
