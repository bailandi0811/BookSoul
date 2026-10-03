import { sendConfirmedEmail } from "@/lib/email-api";
import {
  EMAIL_SUBJECT_MAX_LENGTH,
  EMAIL_TEXT_MAX_LENGTH,
  type EmailDraft,
} from "@/lib/email-draft";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { FormEvent, useId, useRef, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";

interface EmailComposerDialogProps {
  draft: EmailDraft | null;
  onClose: () => void;
}

type DeliveryState = "editing" | "sending" | "sent";

export function EmailComposerDialog({
  draft,
  onClose,
}: EmailComposerDialogProps) {
  const descriptionId = useId();
  const busy = useRef(false);
  const close = () => {
    if (!busy.current) onClose();
  };
  return (
    <Dialog
      open={draft !== null}
      title="发送阅读笔记"
      wide
      descriptionId={descriptionId}
      className="email-letter-dialog"
      onClose={close}
    >
      {draft && (
        <EmailComposerForm
          draft={draft}
          descriptionId={descriptionId}
          onClose={close}
          onBusyChange={(value) => {
            busy.current = value;
          }}
        />
      )}
    </Dialog>
  );
}

function EmailComposerForm({
  draft,
  descriptionId,
  onClose,
  onBusyChange,
}: {
  draft: EmailDraft;
  descriptionId: string;
  onClose: () => void;
  onBusyChange: (value: boolean) => void;
}) {
  const [to, setTo] = useState(draft.to);
  const [subject, setSubject] = useState(draft.subject);
  const [text, setText] = useState(draft.text);
  const [deliveryState, setDeliveryState] = useState<DeliveryState>("editing");
  const [error, setError] = useState<string | null>(null);

  const closeIfIdle = () => {
    if (deliveryState !== "sending") onClose();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!to.trim() || !subject.trim() || !text.trim()) return;
    setDeliveryState("sending");
    onBusyChange(true);
    setError(null);
    try {
      await sendConfirmedEmail({
        to: to.trim(),
        subject: subject.trim(),
        text,
      });
      onBusyChange(false);
      setDeliveryState("sent");
    } catch (sendError) {
      onBusyChange(false);
      setDeliveryState("editing");
      setError(sendError instanceof Error ? sendError.message : "邮件发送失败");
    }
  };

  return (
    <>
      <p id={descriptionId} className="dialog-intro">
        发送前可以修改草稿。点击“确认并发送”后会立即投递，无法撤回。
      </p>
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
              className="email-letter-body min-h-56 resize-y rounded-xl border border-input px-3.5 py-3 outline-none focus:border-primary disabled:opacity-60"
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
          <div className="dialog-actions">
            <button
              type="button"
              onClick={closeIfIdle}
              disabled={deliveryState === "sending"}
              className="dialog-secondary"
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
              className="dialog-primary"
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
    </>
  );
}
