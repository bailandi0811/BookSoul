import { sendConfirmedEmail } from "@/lib/email-api";
import {
  EMAIL_SUBJECT_MAX_LENGTH,
  EMAIL_TEXT_MAX_LENGTH,
  type EmailDraft,
} from "@/lib/email-draft";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2, Mail, X } from "lucide-react";
import { FormEvent, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

interface EmailComposerDialogProps {
  draft: EmailDraft;
  onClose: () => void;
}

type DeliveryState = "editing" | "sending" | "sent";

export function EmailComposerDialog({
  draft,
  onClose,
}: EmailComposerDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const [to, setTo] = useState(draft.to);
  const [subject, setSubject] = useState(draft.subject);
  const [text, setText] = useState(draft.text);
  const [deliveryState, setDeliveryState] = useState<DeliveryState>("editing");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && deliveryState !== "sending") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [deliveryState, onClose]);

  const closeIfIdle = () => {
    if (deliveryState !== "sending") onClose();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!to.trim() || !subject.trim() || !text.trim()) return;
    setDeliveryState("sending");
    setError(null);
    try {
      await sendConfirmedEmail({
        to: to.trim(),
        subject: subject.trim(),
        text,
      });
      setDeliveryState("sent");
    } catch (sendError) {
      setDeliveryState("editing");
      setError(sendError instanceof Error ? sendError.message : "邮件发送失败");
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-5">
      <motion.button
        type="button"
        aria-label="关闭邮件草稿"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-foreground/35 backdrop-blur-[3px]"
        onClick={closeIfIdle}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
        className="warm-card-raised relative z-10 max-h-[min(92dvh,48rem)] w-full max-w-2xl overflow-y-auto rounded-[26px] p-5 sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="warm-tint grid h-10 w-10 shrink-0 place-items-center rounded-[14px] text-primary">
              <Mail className="h-4.5 w-4.5" />
            </span>
            <div>
              <h2 id={titleId} className="text-lg font-bold tracking-tight">
                发送阅读笔记
              </h2>
              <p
                id={descriptionId}
                className="mt-1 text-xs leading-relaxed text-muted-foreground"
              >
                发送前可以修改草稿。点击“确认并发送”后会立即投递，无法撤回。
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeIfIdle}
            disabled={deliveryState === "sending"}
            aria-label="关闭"
            className="rounded-xl p-2 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {deliveryState === "sent" ? (
          <div className="mt-7 rounded-[20px] border border-primary/20 bg-primary/[0.06] p-6 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-3 font-semibold">邮件已交给发送服务</p>
            <p className="mt-1 text-xs text-muted-foreground">收件人：{to}</p>
            <button
              type="button"
              onClick={onClose}
              className="tap-spring mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              完成
            </button>
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="grid gap-1.5 text-xs font-semibold">
              收件人
              <input
                type="email"
                required
                maxLength={254}
                value={to}
                onChange={(event) => setTo(event.target.value)}
                disabled={deliveryState === "sending"}
                autoFocus
                className="h-11 rounded-xl border border-input bg-background px-3.5 text-sm font-normal outline-none focus:border-primary disabled:opacity-60"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold">
              <span className="flex items-center justify-between gap-3">
                主题
                <span className="font-normal text-muted-foreground">
                  {subject.length}/{EMAIL_SUBJECT_MAX_LENGTH}
                </span>
              </span>
              <input
                type="text"
                required
                maxLength={EMAIL_SUBJECT_MAX_LENGTH}
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                disabled={deliveryState === "sending"}
                className="h-11 rounded-xl border border-input bg-background px-3.5 text-sm font-normal outline-none focus:border-primary disabled:opacity-60"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold">
              <span className="flex items-center justify-between gap-3">
                正文
                <span className="font-normal text-muted-foreground">
                  {text.length}/{EMAIL_TEXT_MAX_LENGTH}
                </span>
              </span>
              <textarea
                required
                maxLength={EMAIL_TEXT_MAX_LENGTH}
                rows={12}
                value={text}
                onChange={(event) => setText(event.target.value)}
                disabled={deliveryState === "sending"}
                className="min-h-56 resize-y rounded-xl border border-input bg-background px-3.5 py-3 font-mono text-[13px] leading-relaxed outline-none focus:border-primary disabled:opacity-60"
              />
            </label>
            {error && (
              <p
                role="alert"
                className="rounded-xl border border-destructive/25 bg-destructive/8 px-3 py-2 text-xs text-destructive"
              >
                {error}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeIfIdle}
                disabled={deliveryState === "sending"}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={
                  deliveryState === "sending" ||
                  !to.trim() ||
                  !subject.trim() ||
                  !text.trim()
                }
                className="tap-spring inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deliveryState === "sending" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在发送
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4" />
                    确认并发送
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>,
    document.body,
  );
}
