import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/store/useAuthStore";
import { apiFetch, apiUpload } from "./api";

class FakeXMLHttpRequest {
  static instances: FakeXMLHttpRequest[] = [];

  readonly headers = new Headers();
  readonly upload: {
    onprogress: ((event: ProgressEvent) => void) | null;
  } = { onprogress: null };
  method = "";
  url = "";
  body: Document | XMLHttpRequestBodyInit | null = null;
  withCredentials = false;
  status = 0;
  statusText = "";
  responseText = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXMLHttpRequest.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers.set(name, value);
  }

  getAllResponseHeaders() {
    return "content-type: application/json\r\n";
  }

  send(body: Document | XMLHttpRequestBodyInit | null) {
    this.body = body;
  }

  reportProgress(loaded: number, total: number) {
    this.upload.onprogress?.({
      lengthComputable: true,
      loaded,
      total,
    } as ProgressEvent);
  }

  complete(status: number, responseText: string) {
    this.status = status;
    this.statusText = status === 201 ? "Created" : "OK";
    this.responseText = responseText;
    this.onload?.();
  }
}

describe("apiFetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    FakeXMLHttpRequest.instances = [];
    useAuthStore.getState().clearAuthentication();
  });

  it("reports authenticated upload byte progress", async () => {
    useAuthStore.getState().signIn({
      accessToken: "upload-access",
      user: { id: "user-1", email: "reader@example.com", name: "读者" },
    });
    vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
    const progress = vi.fn();
    const body = new FormData();
    body.append("file", new File(["novel"], "novel.txt"));

    const responsePromise = apiUpload("/api/books", body, progress);
    const request = FakeXMLHttpRequest.instances[0];
    request.reportProgress(512, 1024);
    request.complete(201, "{}");

    await expect(responsePromise).resolves.toMatchObject({ status: 201 });
    expect(request).toMatchObject({
      method: "POST",
      url: "/api/books",
      body,
      withCredentials: true,
    });
    expect(request.headers.get("Authorization")).toBe("Bearer upload-access");
    expect(progress).toHaveBeenCalledWith({
      loadedBytes: 512,
      totalBytes: 1024,
      percent: 50,
    });
  });

  it("does not attach an identity to unauthenticated requests", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await apiFetch("/api/chat/history");

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.has("Authorization")).toBe(false);
    expect(headers.has("X-Guest-User-Id")).toBe(false);
  });

  it("uses one refresh for concurrent 401 responses and replays each once", async () => {
    useAuthStore.getState().signIn({
      accessToken: "old-access",
      user: { id: "user-1", email: "reader@example.com", name: "读者" },
    });
    let refreshCalls = 0;
    let refreshRequest: RequestInit | undefined;
    const businessCalls = new Map<string, number>();
    const lockRequest = vi.fn(
      async (_name: string, callback: () => Promise<unknown>) => callback(),
    );
    vi.stubGlobal("navigator", { locks: { request: lockRequest } });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/auth/refresh") {
        refreshCalls += 1;
        refreshRequest = init;
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              accessToken: "new-access",
              user: useAuthStore.getState().user,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      const calls = (businessCalls.get(url) ?? 0) + 1;
      businessCalls.set(url, calls);
      const headers = new Headers(init?.headers);
      if (headers.get("Authorization") === "Bearer old-access") {
        return new Response("{}", { status: 401 });
      }
      return new Response("{}", { status: 200 });
    });

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, index) => apiFetch(`/api/data/${index}`)),
    );

    expect(results.every((response) => response.status === 200)).toBe(true);
    expect(refreshCalls).toBe(1);
    expect(lockRequest).toHaveBeenCalledWith(
      "booksoul:refresh-token",
      expect.any(Function),
    );
    expect(refreshRequest).toMatchObject({
      method: "POST",
      credentials: "include",
    });
    expect(refreshRequest?.body).toBeUndefined();
    expect([...businessCalls.values()]).toEqual([2, 2, 2, 2, 2]);
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: "new-access",
    });
  });

  it("clears authentication when refresh fails", async () => {
    useAuthStore.getState().signIn({
      accessToken: "old-access",
      user: { id: "user-1", email: "reader@example.com", name: "读者" },
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input) === "/api/auth/refresh"
        ? new Response("{}", { status: 401 })
        : new Response("{}", { status: 401 }),
    );

    await apiFetch("/api/private");

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("does not treat a guest 401 as an expired account session", async () => {
    const guestUserId = useAuthStore.getState().guestUserId;
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 401 }));

    const response = await apiFetch("/api/private");

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().guestUserId).toBe(guestUserId);
  });

  it("keeps the local account when refresh is temporarily unavailable", async () => {
    useAuthStore.getState().signIn({
      accessToken: "old-access",
      user: { id: "user-1", email: "reader@example.com", name: "读者" },
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input) === "/api/auth/refresh"
        ? new Response("{}", { status: 503 })
        : new Response("{}", { status: 401 }),
    );

    await apiFetch("/api/private");

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      accessToken: "old-access",
      user: { id: "user-1" },
    });
  });
});
