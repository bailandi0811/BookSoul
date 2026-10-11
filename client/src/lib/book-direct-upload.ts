import { apiFetch, readApiError, type ApiUploadProgress } from "./api";
import type { BookView } from "./books-api";
import { useAuthStore } from "@/store/useAuthStore";

export type BookUploadStage = "preparing" | "uploading" | "confirming";
interface Ticket {
  id: string;
  status: string;
  byteSize: number;
  sha256: string;
  partSize: number | null;
  uploadedParts: number[];
  upload: {
    method: "POST";
    url: string;
    fields: Record<string, string>;
  } | null;
  parts: { number: number; url: string }[];
}
export interface DirectBookUploadOptions {
  signal?: AbortSignal;
  onStage?: (stage: BookUploadStage) => void;
  onProgress?: (progress: ApiUploadProgress) => void;
}

export class BookUploadError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
const MAX_BYTES = 50 * 1024 ** 2;

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("上传响应无效");
  return value as Record<string, unknown>;
}
function uploadUrl(value: unknown): string {
  if (typeof value !== "string") throw new Error("上传地址无效");
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    !/^[a-z0-9-]+\.oss-[a-z0-9-]+(?:-internal)?\.aliyuncs\.com$/.test(
      url.hostname,
    )
  )
    throw new Error("上传地址无效");
  return url.href;
}
function parseTicket(value: unknown): Ticket {
  const data = object(value);
  if (
    typeof data.id !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(data.id) ||
    typeof data.status !== "string" ||
    !Number.isSafeInteger(data.byteSize) ||
    Number(data.byteSize) < 1 ||
    Number(data.byteSize) > MAX_BYTES ||
    typeof data.sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(data.sha256) ||
    (data.partSize !== null && data.partSize !== 5 * 1024 ** 2) ||
    !Array.isArray(data.parts) ||
    data.parts.length > 10 ||
    !Array.isArray(data.uploadedParts)
  )
    throw new Error("上传响应无效");
  const seen = new Set<number>();
  const partNumber = (value: unknown) => {
    if (
      !Number.isInteger(value) ||
      Number(value) < 1 ||
      Number(value) >
        Math.ceil(Number(data.byteSize) / Number(data.partSize)) ||
      seen.has(Number(value))
    )
      throw new Error("上传分片响应无效");
    seen.add(Number(value));
    return Number(value);
  };
  const uploadedParts = data.uploadedParts.map(partNumber);
  const parts = data.parts.map((value) => {
    const part = object(value);
    return { number: partNumber(part.number), url: uploadUrl(part.url) };
  });
  let upload: Ticket["upload"] = null;
  if (data.upload !== null) {
    const form = object(data.upload);
    const fields = object(form.fields);
    if (
      form.method !== "POST" ||
      Object.values(fields).some((value) => typeof value !== "string")
    )
      throw new Error("上传响应无效");
    upload = {
      method: "POST",
      url: uploadUrl(form.url),
      fields: fields as Record<string, string>,
    };
  }
  return {
    id: data.id,
    status: data.status,
    byteSize: Number(data.byteSize),
    sha256: data.sha256,
    partSize: data.partSize as number | null,
    uploadedParts,
    parts,
    upload,
  };
}

async function request(
  path: string,
  signal: AbortSignal,
  body?: unknown,
  timeout = 20_000,
): Promise<unknown> {
  const response = await apiFetch(`/api/books/uploads${path}`, {
    method: body === undefined ? "GET" : "POST",
    signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)]),
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  if (!response.ok)
    throw new BookUploadError(response.status, await readApiError(response));
  const payload = object(await response.json());
  if (payload.success !== true) throw new Error("上传响应无效");
  return payload.data;
}

function storageError(status: number, response: string): Error {
  let message = "文件上传失败，请重新选择原文件恢复上传";
  // Provider XML may contain private object names; only display fixed messages.
  if (response.length <= 16_384) {
    const xml = new DOMParser().parseFromString(response, "application/xml");
    if (
      !xml.querySelector("parsererror") &&
      xml.documentElement?.tagName === "Error"
    ) {
      const code = xml.querySelector("Code")?.textContent;
      const ec = xml.querySelector("EC")?.textContent;
      const detail = xml.querySelector("Message")?.textContent ?? "";
      if (
        ec === "0006-00000227" ||
        (code === "AccessDenied" &&
          detail.includes("Invalid according to Policy"))
      )
        message = "上传表单与签名策略不一致（OSS 0006-00000227），请联系管理员";
      else if (code === "AccessDenied" && /expired/i.test(detail))
        message = "上传授权已过期，请重新选择原文件获取新授权";
      else if (code === "SignatureDoesNotMatch")
        message = "上传签名校验失败，请联系管理员检查存储签名";
      else if (code === "InvalidAccessKeyId" || code === "AccessDenied")
        message = "存储拒绝上传，请联系管理员检查存储凭据和访问策略";
    }
  }
  return new BookUploadError(status, message);
}

function transfer(
  url: string,
  method: "POST" | "PUT",
  body: FormData | Blob,
  signal: AbortSignal,
  progress: (loaded: number, total: number) => void,
): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const cancel = () => xhr.abort();
    const finish = (error?: Error) => {
      signal.removeEventListener("abort", cancel);
      xhr.onload = xhr.onerror = xhr.onabort = xhr.ontimeout = null;
      xhr.upload.onprogress = null;
      if (error) reject(error);
      else resolve();
    };
    xhr.open(method, uploadUrl(url));
    xhr.withCredentials = false;
    xhr.timeout = 60_000;
    if (method === "PUT")
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      try {
        if (event.lengthComputable && event.total > 0)
          progress(event.loaded, event.total);
      } catch (error) {
        finish(error instanceof Error ? error : new Error("上传已终止"));
        xhr.abort();
      }
    };
    xhr.onload = () =>
      finish(
        xhr.status >= 200 && xhr.status < 300
          ? undefined
          : storageError(xhr.status, xhr.responseText),
      );
    xhr.onerror = () => finish(new Error("网络中断，请重新选择原文件恢复上传"));
    xhr.ontimeout = () =>
      finish(new Error("上传超时，请重新选择原文件恢复上传"));
    xhr.onabort = () =>
      finish(
        new DOMException("上传已暂停，可重新选择原文件继续", "AbortError"),
      );
    signal.addEventListener("abort", cancel, { once: true });
    try {
      xhr.send(body);
    } catch (error) {
      finish(error instanceof Error ? error : new Error("文件上传失败"));
    }
  });
}

function readSaved(
  key: string,
): { requestId: string; sessionId?: string } | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null") as unknown;
    if (!value) return null;
    const data = object(value);
    return typeof data.requestId === "string" &&
      (data.sessionId === undefined || typeof data.sessionId === "string")
      ? (data as { requestId: string; sessionId?: string })
      : null;
  } catch {
    return null;
  }
}
function save(
  key: string,
  value: { requestId: string; sessionId?: string } | null,
) {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {
    /* Server idempotency remains valid when browser storage is unavailable. */
  }
}

export async function uploadBookDirect(
  file: File,
  options: DirectBookUploadOptions = {},
): Promise<BookView> {
  if (
    file.size < 1 ||
    file.size > MAX_BYTES ||
    !/\.(epub|txt)$/i.test(file.name)
  )
    throw new Error("请选择不超过 50 MiB 的 EPUB / TXT 文件");
  const owner = useAuthStore.getState().user?.id;
  const generation = useAuthStore.getState().authGeneration;
  if (!owner) throw new Error("请先登录");
  const controller = new AbortController();
  const signal = AbortSignal.any([
    controller.signal,
    ...(options.signal ? [options.signal] : []),
  ]);
  const assertCurrent = () => {
    signal.throwIfAborted();
    if (
      generation !== useAuthStore.getState().authGeneration ||
      owner !== useAuthStore.getState().user?.id
    )
      throw new DOMException("账号已切换", "AbortError");
  };
  assertCurrent();
  options.onStage?.("preparing");
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const sha256 = Array.from(new Uint8Array(hash), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  assertCurrent();
  const key = `booksoul:book-upload:${owner}:${sha256}:${file.size}`;
  let saved = readSaved(key) ?? { requestId: crypto.randomUUID() };
  save(key, saved);
  let ticket: Ticket;
  try {
    if (saved.sessionId) {
      try {
        ticket = parseTicket(
          await request(`/${encodeURIComponent(saved.sessionId)}`, signal),
        );
      } catch (error) {
        if (
          !(error instanceof BookUploadError) ||
          ![404, 410].includes(error.status)
        )
          throw error;
        saved = { requestId: crypto.randomUUID() };
        save(key, saved);
      }
    }
    if (!saved.sessionId) {
      const createTicket = async () => {
        assertCurrent();
        return parseTicket(
          await request("", signal, {
            requestId: saved.requestId,
            fileName: file.name,
            byteSize: file.size,
            sha256,
          }),
        );
      };
      try {
        ticket = await createTicket();
      } catch (error) {
        // A lost ticket response can leave only a request ID for a later cancelled session.
        // Renew exactly once after the server confirms it is terminal; keep transient failures idempotent.
        if (!(error instanceof BookUploadError) || error.status !== 410)
          throw error;
        assertCurrent();
        saved = { requestId: crypto.randomUUID() };
        save(key, saved);
        ticket = await createTicket();
      }
      saved.sessionId = ticket.id;
      save(key, saved);
    }
    assertCurrent();
    const current = ticket!;
    if (current.sha256 !== sha256 || current.byteSize !== file.size)
      throw new Error("原文件与上传任务不匹配");
    options.onStage?.("uploading");
    const loaded = new Map<number, number>();
    const report = () => {
      assertCurrent();
      const bytes = Math.min(
        file.size,
        [...loaded.values()].reduce((sum, value) => sum + value, 0),
      );
      options.onProgress?.({
        loadedBytes: bytes,
        totalBytes: file.size,
        percent: Math.floor((bytes / file.size) * 100),
      });
    };
    if (current.partSize) {
      const partSize = current.partSize;
      for (const number of current.uploadedParts)
        loaded.set(
          number,
          Math.min(partSize, file.size - (number - 1) * partSize),
        );
      report();
      let cursor = 0;
      await Promise.all(
        Array.from({ length: Math.min(3, current.parts.length) }, async () => {
          while (cursor < current.parts.length) {
            const part = current.parts[cursor++];
            const blob = file.slice(
              (part.number - 1) * partSize,
              Math.min(part.number * partSize, file.size),
            );
            await transfer(part.url, "PUT", blob, signal, (bytes, total) => {
              loaded.set(part.number, Math.floor((bytes / total) * blob.size));
              report();
            });
            loaded.set(part.number, blob.size);
            report();
          }
        }),
      );
    } else if (current.upload) {
      const form = new FormData();
      for (const [name, value] of Object.entries(current.upload.fields))
        form.append(name, value);
      // OS MIME associations vary; match the server's extension-based MIME contract.
      const mime = /\.epub$/i.test(file.name)
        ? "application/epub+zip"
        : "text/plain";
      form.append("file", new File([file], file.name, { type: mime }));
      await transfer(
        current.upload.url,
        "POST",
        form,
        signal,
        (bytes, total) => {
          loaded.set(1, Math.floor((bytes / total) * file.size));
          report();
        },
      );
    }
    assertCurrent();
    options.onStage?.("confirming");
    const book = await request(
      `/${encodeURIComponent(current.id)}/commit`,
      signal,
      {},
      90_000,
    );
    assertCurrent();
    const data = object(book);
    if (typeof data.id !== "string" || typeof data.status !== "string")
      throw new Error("书籍确认响应无效");
    save(key, null);
    return book as BookView;
  } catch (error) {
    controller.abort();
    throw error;
  }
}
