import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/store/useAuthStore";
import { uploadBookDirect } from "./book-direct-upload";
import type { ApiUploadProgress } from "./api";

const sha256 = "61".repeat(32);
const sessionId = "11111111-1111-4111-8111-111111111111";
const url =
  "https://fixture-bucket.oss-cn-hangzhou.aliyuncs.com/fixture?signature=fixture";
const result = { id: "book-a", status: "QUEUED" };
const response = (data: unknown, status = 200) =>
  new Response(
    JSON.stringify(status === 200 ? { success: true, data } : data),
    { status, headers: { "Content-Type": "application/json" } },
  );
const ticket = (bytes: number, override: Record<string, unknown> = {}) => ({
  id: sessionId,
  status: "UPLOADING",
  byteSize: bytes,
  sha256,
  partSize: null,
  uploadedParts: [],
  upload: { method: "POST", url, fields: { key: "fixture" } },
  parts: [],
  ...override,
});
function file(bytes: number) {
  const value = new File(["x"], "fixture.txt");
  Object.defineProperty(value, "size", { value: bytes });
  Object.defineProperty(value, "arrayBuffer", {
    value: () => Promise.resolve(new ArrayBuffer(1)),
  });
  return value;
}
class Xhr {
  static instances: Xhr[] = [];
  static autoComplete = true;
  upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  status = 204;
  responseText = "";
  withCredentials = true;
  timeout = 0;
  method = "";
  body?: Blob | FormData;
  headers: Record<string, string> = {};
  constructor() {
    Xhr.instances.push(this);
  }
  open(method: string) {
    this.method = method;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: Blob | FormData) {
    this.body = body;
    if (Xhr.autoComplete) queueMicrotask(() => this.onload?.());
  }
  abort() {
    this.onabort?.();
  }
}
beforeEach(() => {
  localStorage.clear();
  Xhr.instances = [];
  Xhr.autoComplete = true;
  useAuthStore.setState({
    user: {
      id: "owner-a",
      email: "reader@example.invalid",
      name: "Reader",
      emailVerifiedAt: null,
    },
    accessToken: "fixture-token",
    authGeneration: 10,
  });
  vi.stubGlobal("crypto", {
    subtle: {
      digest: vi.fn().mockResolvedValue(new Uint8Array(32).fill(0x61).buffer),
    },
    randomUUID: vi.fn().mockReturnValue(sessionId),
  });
  vi.stubGlobal("XMLHttpRequest", Xhr);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("direct book uploads", () => {
  it.each([
    ["fixture.epub", "application/epub", "application/epub+zip"],
    ["fixture.epub", "application/zip", "application/epub+zip"],
    ["fixture.epub", "", "application/epub+zip"],
    ["fixture.txt", "application/octet-stream", "text/plain"],
  ])(
    "normalizes %s with browser type %s without changing bytes",
    async (name, type, expected) => {
      const input = new File(["synthetic content"], name, { type });
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce(response(ticket(input.size)))
          .mockResolvedValueOnce(response(result)),
      );
      await uploadBookDirect(input);
      const form = Xhr.instances[0].body as FormData;
      const uploaded = form.get("file") as File;
      expect(uploaded.type).toBe(expected);
      expect(uploaded.name).toBe(name);
      expect(await uploaded.text()).toBe(await input.text());
      expect([...form.keys()].at(-1)).toBe("file");
      expect(Xhr.instances[0].headers).toEqual({});
    },
  );

  it.each([
    ["AccessDenied", "0006-00000227", "private-object", "签名策略不一致"],
    [
      "AccessDenied",
      "",
      "Invalid according to Policy: private-object",
      "签名策略不一致",
    ],
    ["AccessDenied", "", "Policy expired: private-object", "上传授权已过期"],
    ["SignatureDoesNotMatch", "", "private-object", "上传签名校验失败"],
    ["AccessDenied", "", "private-object", "存储拒绝上传"],
    ["InvalidAccessKeyId", "", "private-object", "存储拒绝上传"],
    ["UnknownProviderError", "", "private-object", "文件上传失败"],
  ])(
    "classifies OSS %s / %s safely without retrying or committing",
    async (code, ec, detail, expected) => {
      const fetcher = vi.fn().mockResolvedValue(response(ticket(12)));
      vi.stubGlobal("fetch", fetcher);
      Xhr.autoComplete = false;
      const running = uploadBookDirect(file(12));
      const rejected = expect(running).rejects.toMatchObject({
        status: 403,
        message: expect.stringContaining(expected),
      });
      const privateRejected = expect(running).rejects.toThrow(
        expect.not.stringContaining("private-object"),
      );
      await vi.waitFor(() => expect(Xhr.instances).toHaveLength(1));
      const xhr = Xhr.instances[0];
      xhr.status = 403;
      xhr.responseText = `<Error><Code>${code}</Code><Message>${detail}</Message><EC>${ec}</EC></Error>`;
      xhr.onload?.();
      await rejected;
      await privateRejected;
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(Xhr.instances).toHaveLength(1);
    },
  );

  it("replaces a cancelled request after a lost upload authorization response", async () => {
    const replacementId = "22222222-2222-4222-8222-222222222222";
    vi.mocked(crypto.randomUUID)
      .mockReturnValueOnce(sessionId)
      .mockReturnValue(replacementId);
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("authorization response lost"))
      .mockResolvedValueOnce(
        response({ message: "上传已过期或取消，请重新上传" }, 410),
      )
      .mockResolvedValueOnce(response(ticket(12, { id: replacementId })))
      .mockResolvedValueOnce(response(result));
    vi.stubGlobal("fetch", fetcher);
    await expect(uploadBookDirect(file(12))).rejects.toThrow(
      "authorization response lost",
    );
    await expect(uploadBookDirect(file(12))).resolves.toMatchObject(result);
    expect(JSON.parse(fetcher.mock.calls[1][1].body).requestId).toBe(sessionId);
    expect(JSON.parse(fetcher.mock.calls[2][1].body).requestId).toBe(
      replacementId,
    );
    expect(fetcher.mock.calls[3][0]).toContain(`/${replacementId}/commit`);
    expect(Xhr.instances).toHaveLength(1);
  });

  it("does not loop if a replacement session is also rejected", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(async () => response({ message: "上传已过期" }, 410));
    vi.stubGlobal("fetch", fetcher);
    await expect(uploadBookDirect(file(12))).rejects.toThrow("上传已过期");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(Xhr.instances).toHaveLength(0);
  });

  it("preserves the idempotency key and does not retry transient ticket failures", async () => {
    const key = `booksoul:book-upload:owner-a:${sha256}:12`;
    const fetcher = vi
      .fn()
      .mockResolvedValue(response({ message: "存储暂时不可用" }, 503));
    vi.stubGlobal("fetch", fetcher);
    await expect(uploadBookDirect(file(12))).rejects.toThrow("存储暂时不可用");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual({
      requestId: sessionId,
    });
  });

  it("replaces an expired saved session before transferring the file", async () => {
    localStorage.setItem(
      `booksoul:book-upload:owner-a:${sha256}:12`,
      JSON.stringify({ requestId: sessionId, sessionId }),
    );
    const replacementId = "22222222-2222-4222-8222-222222222222";
    vi.mocked(crypto.randomUUID).mockReturnValue(replacementId);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ message: "上传已取消" }, 410))
      .mockResolvedValueOnce(response(ticket(12, { id: replacementId })))
      .mockResolvedValueOnce(response(result));
    vi.stubGlobal("fetch", fetcher);
    await expect(uploadBookDirect(file(12))).resolves.toMatchObject(result);
    expect(fetcher.mock.calls[0][0]).toBe(`/api/books/uploads/${sessionId}`);
    expect(JSON.parse(fetcher.mock.calls[1][1].body).requestId).toBe(
      replacementId,
    );
    expect(Xhr.instances).toHaveLength(1);
  });

  it("does not create a replacement session after an account switch", async () => {
    const fetcher = vi.fn().mockImplementation(async () => {
      useAuthStore.setState({ authGeneration: 11 });
      return response({ message: "上传已取消" }, 410);
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(uploadBookDirect(file(12))).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(Xhr.instances).toHaveLength(0);
  });
  it("bounds concurrent parts to three and pauses all transfers without confirming", async () => {
    const bytes = 50 * 1024 ** 2;
    const fetcher = vi.fn().mockResolvedValue(
      response(
        ticket(bytes, {
          partSize: 5 * 1024 ** 2,
          uploadedParts: [],
          upload: null,
          parts: Array.from({ length: 10 }, (_, index) => ({
            number: index + 1,
            url,
          })),
        }),
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    Xhr.autoComplete = false;
    const controller = new AbortController();
    const running = uploadBookDirect(file(bytes), {
      signal: controller.signal,
    });
    const rejected = expect(running).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.waitFor(() => expect(Xhr.instances).toHaveLength(3));
    controller.abort();
    await rejected;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(Xhr.instances).toHaveLength(3);
  });
  it("uploads privately and confirms, without sending account credentials to OSS", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(ticket(12)))
      .mockResolvedValueOnce(response(result));
    vi.stubGlobal("fetch", fetcher);
    const stages: string[] = [];
    await expect(
      uploadBookDirect(file(12), { onStage: (value) => stages.push(value) }),
    ).resolves.toMatchObject(result);
    expect(stages).toEqual(["preparing", "uploading", "confirming"]);
    expect(Xhr.instances).toHaveLength(1);
    expect(Xhr.instances[0].withCredentials).toBe(false);
    expect(Xhr.instances[0].headers).toEqual({});
    expect(fetcher.mock.calls[1][0]).toContain("/commit");
  });
  it("resumes only missing parts and reports already uploaded bytes", async () => {
    const bytes = 11 * 1024 ** 2;
    localStorage.setItem(
      `booksoul:book-upload:owner-a:${sha256}:${bytes}`,
      JSON.stringify({ requestId: sessionId, sessionId }),
    );
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response(
          ticket(bytes, {
            partSize: 5 * 1024 ** 2,
            uploadedParts: [1],
            upload: null,
            parts: [
              { number: 2, url },
              { number: 3, url },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(response(result));
    vi.stubGlobal("fetch", fetcher);
    const progress: ApiUploadProgress[] = [];
    await uploadBookDirect(file(bytes), {
      onProgress: (value) => progress.push(value),
    });
    expect(fetcher.mock.calls[0][0]).toBe(`/api/books/uploads/${sessionId}`);
    expect(Xhr.instances).toHaveLength(2);
    expect(Xhr.instances.every((xhr) => xhr.method === "PUT")).toBe(true);
    expect(progress[0].loadedBytes).toBe(5 * 1024 ** 2);
  });
  it("retains a session after a lost commit response and retries confirmation without uploading again", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(ticket(12)))
      .mockRejectedValueOnce(new TypeError("connection lost"))
      .mockResolvedValueOnce(response(ticket(12, { upload: null })))
      .mockResolvedValueOnce(response(result));
    vi.stubGlobal("fetch", fetcher);
    await expect(uploadBookDirect(file(12))).rejects.toThrow("connection lost");
    await expect(uploadBookDirect(file(12))).resolves.toMatchObject(result);
    expect(Xhr.instances).toHaveLength(1);
  });
  it("never commits after an account switch while creating the ticket", async () => {
    const fetcher = vi.fn().mockImplementation(async () => {
      useAuthStore.setState({ authGeneration: 11 });
      return response(ticket(12));
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(uploadBookDirect(file(12))).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(Xhr.instances).toHaveLength(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects a third-party upload URL before any file transmission", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response(
          ticket(12, {
            upload: {
              method: "POST",
              url: "https://attacker.example.invalid/",
              fields: {},
            },
          }),
        ),
      ),
    );
    await expect(uploadBookDirect(file(12))).rejects.toThrow("上传地址无效");
    expect(Xhr.instances).toHaveLength(0);
  });
  it("rejects a mismatched resume fingerprint before transfer or confirmation", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(response(ticket(12, { sha256: "b".repeat(64) })));
    vi.stubGlobal("fetch", fetcher);
    await expect(uploadBookDirect(file(12))).rejects.toThrow(
      "原文件与上传任务不匹配",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
