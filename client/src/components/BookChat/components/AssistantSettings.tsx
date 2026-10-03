import { useBooksStore } from "@/store/useBooksStore";
import type { BookAssistant } from "@/lib/books-api";
import { Settings2 } from "lucide-react";
import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";

export function AssistantSettings({ compact = false }: { compact?: boolean }) {
  const assistant = useBooksStore((state) => state.assistant);
  const updateAssistant = useBooksStore((state) => state.updateAssistant);
  const workspaceError = useBooksStore((state) => state.workspaceError);
  if (!assistant) return null;
  return (
    <AssistantSettingsForm
      key={assistant.id}
      assistant={assistant}
      compact={compact}
      onSave={updateAssistant}
      error={workspaceError}
    />
  );
}

function AssistantSettingsForm({
  assistant,
  onSave,
  error,
  compact,
}: {
  assistant: BookAssistant;
  onSave: ReturnType<typeof useBooksStore.getState>["updateAssistant"];
  error: string | null;
  compact: boolean;
}) {
  const [name, setName] = useState(assistant.name);
  const [responseDepth, setResponseDepth] = useState<
    "BRIEF" | "BALANCED" | "DEEP"
  >(assistant.responseDepth);
  const [tone, setTone] = useState<"NATURAL" | "WARM" | "ANALYTICAL">(
    assistant.tone,
  );
  const [customInstruction, setCustomInstruction] = useState(
    assistant.customInstruction ?? "",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setName(assistant.name);
          setResponseDepth(assistant.responseDepth);
          setTone(assistant.tone);
          setCustomInstruction(assistant.customInstruction ?? "");
          setSaved(false);
          setOpen(true);
        }}
        className={
          compact ? "conversation-settings tap-spring" : "sidebar-tool"
        }
        aria-label="助手设置"
      >
        <Settings2 className="h-4 w-4" />
        {!compact && "助手设置"}
      </button>
      <Dialog
        open={open}
        title="这本书的助手"
        onClose={() => {
          if (!isSaving) setOpen(false);
        }}
      >
        <p className="dialog-intro mb-5">只应用于当前这本书的助手。</p>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setIsSaving(true);
            setSaved(false);
            void onSave({
              name,
              responseDepth,
              tone,
              customInstruction,
            }).then((didSave) => {
              setIsSaving(false);
              setSaved(didSave);
            });
          }}
        >
          <label className="grid gap-1.5 text-xs font-medium text-foreground">
            助手名称
            <input
              disabled={isSaving}
              value={name}
              maxLength={80}
              required
              onChange={(event) => {
                setName(event.target.value);
                setSaved(false);
              }}
              className="h-11 rounded-xl border border-input bg-background px-3 text-base font-normal outline-none focus:border-primary"
            />
          </label>

          <fieldset className="dialog-field">
            <legend>回答深度</legend>
            <div className="setting-segment">
              {(
                [
                  ["BRIEF", "简洁"],
                  ["BALANCED", "适中"],
                  ["DEEP", "深入"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={responseDepth === value ? "is-selected" : ""}
                >
                  <input
                    type="radio"
                    name="response-depth"
                    value={value}
                    checked={responseDepth === value}
                    disabled={isSaving}
                    onChange={() => {
                      setResponseDepth(value);
                      setSaved(false);
                    }}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="dialog-field">
            <legend>语气</legend>
            <div className="setting-segment">
              {(
                [
                  ["NATURAL", "自然"],
                  ["WARM", "温和"],
                  ["ANALYTICAL", "分析型"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={tone === value ? "is-selected" : ""}
                >
                  <input
                    type="radio"
                    name="assistant-tone"
                    value={value}
                    checked={tone === value}
                    disabled={isSaving}
                    onChange={() => {
                      setTone(value);
                      setSaved(false);
                    }}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="grid gap-1.5 text-xs font-medium text-foreground">
            自定义偏好
            <textarea
              disabled={isSaving}
              value={customInstruction}
              maxLength={1000}
              rows={3}
              placeholder="例如：回答人物关系时先给结论，再列依据"
              onChange={(event) => {
                setCustomInstruction(event.target.value);
                setSaved(false);
              }}
              className="resize-none rounded-xl border border-input bg-background px-3 py-2 text-xs font-normal leading-relaxed outline-none placeholder:text-muted-foreground/70 focus:border-primary"
            />
          </label>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="text-xs text-muted-foreground">
              设置已保存，将用于下一次提问。
            </p>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              className="dialog-secondary"
              disabled={isSaving}
              onClick={() => setOpen(false)}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSaving || !name.trim()}
              className="dialog-primary"
            >
              {isSaving ? "正在保存…" : saved ? "已保存" : "保存设置"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
