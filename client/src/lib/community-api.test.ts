import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAuthStore } from "@/store/useAuthStore";
import {
  joinCommunity,
  listCommunityMessages,
  requestCommunityWsTicket,
  parseCommunityMessage,
} from "./community-api";
const user = {
  id: "fixture-a",
  email: "fixture@example.invalid",
  name: "Reader",
};
const memberId = "b830361c-448c-403a-8ef0-e35fb4c2998c";
const summary = {
  memberId,
  isModerator: false,
  mutedUntil: null,
  lastReadSeq: "0",
  unreadCount: 0,
  replyUnreadCount: 0,
  latestEventSeq: "0",
};
beforeEach(() => {
  useAuthStore.getState().signIn({ user, accessToken: "fixture-access" });
  vi.spyOn(globalThis, "fetch");
});
afterEach(() => {
  useAuthStore.getState().clearAuthentication();
  vi.restoreAllMocks();
});
it("joins with consent and only trusted identity headers", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ success: true, data: summary })),
  );
  expect(await joinCommunity()).toEqual({
    ...summary,
    mentionUnreadCount: 0,
    consentVersion: "2026-10-04",
  });
  const [url, options] = vi.mocked(fetch).mock.calls[0];
  expect(url).toBe("/api/community/membership");
  expect(options?.body).toBe(JSON.stringify({ consentVersion: "2026-10-05" }));
  expect(new Headers(options?.headers).get("Authorization")).toBe(
    "Bearer fixture-access",
  );
});
it("rejects old identity response after account switch", async () => {
  let finish!: (response: Response) => void;
  vi.mocked(fetch).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const promise = listCommunityMessages({});
  useAuthStore
    .getState()
    .signIn({ user: { ...user, id: "fixture-b" }, accessToken: "fixture-b" });
  finish(
    new Response(
      JSON.stringify({
        success: true,
        data: {
          messages: [],
          hasMore: false,
          nextCursor: null,
          latestEventSeq: "0",
        },
      }),
    ),
  );
  await expect(promise).rejects.toThrow();
});
it("returns structured retry limits and never submits owner fields", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(
      JSON.stringify({
        code: "COMMUNITY_CONNECTION_LIMIT",
        retryAfterSeconds: 5,
      }),
      { status: 429, headers: { "Retry-After": "5" } },
    ),
  );
  await expect(requestCommunityWsTicket()).rejects.toMatchObject({
    status: 429,
    retryAfterSeconds: 5,
  });
  expect(vi.mocked(fetch).mock.calls[0][1]?.body).toBe(JSON.stringify({}));
});
it("rejects accidental private fields in message DTO", () => {
  expect(() =>
    parseCommunityMessage({
      id: "public-message",
      seq: "1",
      clientMessageId: "public-key",
      author: { memberId, name: "Reader", email: "fixture@example.invalid" },
      content: "hello",
      status: "ACTIVE",
      createdAt: new Date(0).toISOString(),
      replyTo: null,
    }),
  ).toThrow();
});
