import { useBooksStore } from "@/store/useBooksStore";
import type { BookAssistant } from "@/lib/books-api";
import { Settings2 } from "lucide-react";
import { useState } from "react";

export function AssistantSettings() {
  const assistant = useBooksStore((state) => state.assistant);
  const updateAssistant = useBooksStore((state) => state.updateAssistant);
  if (!assistant) return null;
  return (
    <AssistantSettingsForm
      key={`${assistant.id}:${assistant.updatedAt}`}
      assistant={assistant}
      onSave={updateAssistant}
    />
  );
}

function AssistantSettingsForm({
  assistant,
  onSave,
}: {
  assistant: BookAssistant;
  onSave: ReturnType<typeof useBooksStore.getState>["updateAssistant"];
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

  return (
    <details className="warm-card group rounded-[18px]">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-3 text-sm font-medium text-muted-foreground hover:text-foreground">
        <Settings2 className="h-4 w-4" />
        助手设置
      </summary>
      <form
        className="space-y-3 border-t border-border/70 p-3.5"
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
            value={name}
            maxLength={80}
            required
            onChange={(event) => setName(event.target.value)}
            className="h-9 rounded-xl border border-input bg-background px-3 text-sm font-normal outline-none focus:border-primary"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1.5 text-xs font-medium text-foreground">
            回答深度
            <select
              value={responseDepth}
              onChange={(event) =>
                setResponseDepth(
                  event.target.value as "BRIEF" | "BALANCED" | "DEEP",
                )
              }
              className="h-9 rounded-xl border border-input bg-background px-2 text-xs font-normal outline-none focus:border-primary"
            >
              <option value="BRIEF">简洁</option>
              <option value="BALANCED">适中</option>
              <option value="DEEP">深入</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-foreground">
            语气
            <select
              value={tone}
              onChange={(event) =>
                setTone(event.target.value as "NATURAL" | "WARM" | "ANALYTICAL")
              }
              className="h-9 rounded-xl border border-input bg-background px-2 text-xs font-normal outline-none focus:border-primary"
            >
              <option value="NATURAL">自然</option>
              <option value="WARM">温和</option>
              <option value="ANALYTICAL">分析型</option>
            </select>
          </label>
        </div>

        <label className="grid gap-1.5 text-xs font-medium text-foreground">
          自定义偏好
          <textarea
            value={customInstruction}
            maxLength={1000}
            rows={3}
            placeholder="例如：回答人物关系时先给结论，再列依据"
            onChange={(event) => setCustomInstruction(event.target.value)}
            className="resize-none rounded-xl border border-input bg-background px-3 py-2 text-xs font-normal leading-relaxed outline-none placeholder:text-muted-foreground/70 focus:border-primary"
          />
        </label>

        <button
          type="submit"
          disabled={isSaving || !name.trim()}
          className="tap-spring w-full rounded-xl bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {isSaving ? "正在保存" : saved ? "已保存" : "保存设置"}
        </button>
      </form>
    </details>
  );
}
