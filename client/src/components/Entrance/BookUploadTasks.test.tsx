import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BookUploadTasks } from "./BookUploadTasks";
import { useAuthStore } from "@/store/useAuthStore";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  useAuthStore.setState({ accessToken: "fixture", authGeneration: 10 });
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it("adds no interface when there are no pending uploads", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: [] })),
      ),
  );
  await act(async () => root.render(<BookUploadTasks uploading={false} />));
  expect(container.childElementCount).toBe(0);
});

it("keeps pending tasks collapsed and lets the user cancel without selecting a file", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: [
            {
              id: "fixture-session",
              fileName: "fixture.txt",
              status: "UPLOADING",
            },
          ],
        }),
      ),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: [] })),
    );
  vi.stubGlobal("fetch", fetcher);
  await act(async () => root.render(<BookUploadTasks uploading={false} />));
  const tasks = container.querySelector("details")!;
  expect(tasks.open).toBe(false);
  expect(tasks.querySelector("summary")?.textContent).toBe("1 项未完成上传");
  tasks.open = true;
  await act(async () => tasks.querySelector("button")!.click());
  expect(fetcher.mock.calls[1][0]).toBe("/api/books/uploads/fixture-session");
  expect(fetcher.mock.calls[1][1].method).toBe("DELETE");
  expect(container.childElementCount).toBe(0);
});
