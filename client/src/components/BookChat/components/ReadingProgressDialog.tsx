import { useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import type { ReadingMode } from "@/lib/books-api";
import { useBooksStore } from "@/store/useBooksStore";

export function ReadingProgressDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const busy = useRef(false);
  const close = () => {
    if (!busy.current) onClose();
  };
  return (
    <Dialog open={open} title="更新阅读进度" onClose={close}>
      <ProgressForm
        onClose={close}
        onBusyChange={(value) => {
          busy.current = value;
        }}
      />
    </Dialog>
  );
}

function ProgressForm({
  onClose,
  onBusyChange,
}: {
  onClose: () => void;
  onBusyChange: (value: boolean) => void;
}) {
  const { readingProgress, sections, updateProgress, workspaceError } =
    useBooksStore();
  const [mode, setMode] = useState<ReadingMode>(
    readingProgress?.mode ?? "NOT_STARTED",
  );
  const [order, setOrder] = useState(
    String(readingProgress?.currentSectionOrder ?? sections[0]?.order ?? 1),
  );
  const [saving, setSaving] = useState(false);
  const close = () => {
    if (!saving) onClose();
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (saving) return;
        setSaving(true);
        onBusyChange(true);
        void updateProgress(
          mode,
          mode === "IN_PROGRESS" ? Number(order) : undefined,
        ).then(() => {
          setSaving(false);
          onBusyChange(false);
          if (!useBooksStore.getState().workspaceError) onClose();
        });
      }}
    >
      <p className="dialog-intro">
        把书签放在你读到的位置，助手会跟着你的进度聊。
      </p>
      <div className="dialog-field">
        <span>阅读状态</span>
        <Select
          label="阅读状态"
          value={mode}
          disabled={saving}
          options={[
            { value: "NOT_STARTED", label: "尚未开始" },
            { value: "IN_PROGRESS", label: "阅读中" },
            { value: "FINISHED", label: "已读完" },
          ]}
          onChange={(value) => setMode(value as ReadingMode)}
        />
      </div>
      {mode === "IN_PROGRESS" && (
        <div className="dialog-field">
          <span>当前读到</span>
          <Select
            label="当前读到"
            value={order}
            disabled={saving}
            options={sections.map((section) => ({
              value: String(section.order),
              label: `第 ${section.order} 节  ${section.title}`,
            }))}
            onChange={setOrder}
          />
        </div>
      )}
      <p className="dialog-scope-note">
        <ShieldCheck size={18} strokeWidth={1.5} />
        <span>更新进度后，助手会在新的已读范围内回答。</span>
      </p>
      {workspaceError && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {workspaceError}
        </p>
      )}
      <div className="dialog-actions">
        <button
          type="button"
          className="dialog-secondary"
          disabled={saving}
          onClick={close}
        >
          取消
        </button>
        <button
          type="submit"
          className="dialog-primary"
          disabled={saving || (mode === "IN_PROGRESS" && !sections.length)}
        >
          {saving ? "正在保存…" : "保存书签"}
        </button>
      </div>
    </form>
  );
}
