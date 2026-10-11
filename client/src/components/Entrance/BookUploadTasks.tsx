import { useEffect, useState } from "react";
import { apiFetch, readApiError } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";

interface PendingUpload {
  id: string;
  fileName: string;
  status: string;
}
export function BookUploadTasks({ uploading }: { uploading: boolean }) {
  const generation = useAuthStore((state) => state.authGeneration);
  const [tasks, setTasks] = useState<PendingUpload[]>([]);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setTasks([]);
    setError(null);
    void (async () => {
      try {
        const response = await apiFetch("/api/books/uploads", {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15_000),
          ]),
        });
        if (!response.ok) throw new Error(await readApiError(response));
        const payload: unknown = await response.json();
        if (
          typeof payload !== "object" ||
          payload === null ||
          !("data" in payload) ||
          !Array.isArray(payload.data)
        )
          throw new Error("上传任务响应无效");
        const values: PendingUpload[] = payload.data.map((item: unknown) => {
          if (
            typeof item !== "object" ||
            item === null ||
            !("id" in item) ||
            typeof item.id !== "string" ||
            !("fileName" in item) ||
            typeof item.fileName !== "string" ||
            !("status" in item) ||
            typeof item.status !== "string"
          )
            throw new Error("上传任务响应无效");
          return { id: item.id, fileName: item.fileName, status: item.status };
        });
        if (!controller.signal.aborted) setTasks(values);
      } catch (error) {
        if (!controller.signal.aborted)
          setError(error instanceof Error ? error.message : "上传任务读取失败");
      }
    })();
    return () => controller.abort();
  }, [generation, revision, uploading]);
  const cancel = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      const response = await apiFetch(
        `/api/books/uploads/${encodeURIComponent(id)}`,
        { method: "DELETE", signal: AbortSignal.timeout(15_000) },
      );
      if (generation !== useAuthStore.getState().authGeneration) return;
      if (!response.ok) throw new Error(await readApiError(response));
      setRevision((value) => value + 1);
    } catch (error) {
      if (generation === useAuthStore.getState().authGeneration)
        setError(error instanceof Error ? error.message : "取消失败");
    } finally {
      if (generation === useAuthStore.getState().authGeneration) setBusy(null);
    }
  };
  return (
    <>
      {!uploading && tasks.length > 0 && (
        <details
          className="library-error space-y-2 text-xs text-muted-foreground"
          aria-label="未完成的小说上传"
        >
          <summary className="cursor-pointer">
            {tasks.length} 项未完成上传
          </summary>
          <p>有未完成的上传，重新选择原文件可继续。</p>
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center justify-between gap-3"
            >
              <span className="truncate">
                {task.fileName}
                {task.status === "FINALIZING" ? " · 正在确认" : ""}
              </span>
              <button
                type="button"
                className="shrink-0 underline"
                disabled={busy !== null}
                onClick={() => void cancel(task.id)}
              >
                取消上传
              </button>
            </div>
          ))}
        </details>
      )}
      {error && (
        <p role="alert" className="library-error text-xs text-destructive">
          {error}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => setRevision((value) => value + 1)}
          >
            重试读取上传任务
          </button>
        </p>
      )}
    </>
  );
}
