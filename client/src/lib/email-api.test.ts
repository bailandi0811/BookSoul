import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/store/useAuthStore";
import { sendConfirmedEmail } from "./email-api";

describe("sendConfirmedEmail", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useAuthStore.getState().clearAuthentication();
    useAuthStore.getState().signIn({
      accessToken: "access-token",
      user: {
        id: "reader-1",
        email: "reader@example.com",
        name: "读者",
      },
    });
  });

  it("sends an authenticated request with explicit confirmation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await sendConfirmedEmail({
      to: "reader@example.com",
      subject: "阅读笔记",
      text: "正文",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/tools/email");
    expect(request?.method).toBe("POST");
    expect(new Headers(request?.headers).get("Authorization")).toBe(
      "Bearer access-token",
    );
    expect(JSON.parse(String(request?.body))).toEqual({
      to: "reader@example.com",
      subject: "阅读笔记",
      text: "正文",
      confirmed: true,
    });
  });

  it("surfaces the server error instead of claiming delivery", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "邮件服务尚未配置" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      sendConfirmedEmail({
        to: "reader@example.com",
        subject: "阅读笔记",
        text: "正文",
      }),
    ).rejects.toThrow("邮件服务尚未配置");
  });
});
