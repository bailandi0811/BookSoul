import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAuthStore } from "./useAuthStore";
import { useCommunityStore } from "./useCommunityStore";
import * as api from "@/lib/community-api";
import { openCommunitySocket } from "@/lib/community-socket";
import type { CommunityFrame, CommunityMessage } from "@/lib/community-types";
vi.mock("@/lib/community-api");
vi.mock("@/lib/community-socket");
const summary = {
  memberId: "member-a",
  isModerator: false,
  mutedUntil: null,
  lastReadSeq: "0",
  unreadCount: 0,
  replyUnreadCount: 0,
  latestEventSeq: "0",
};
let deliver: (frame: CommunityFrame) => void;
let disconnectCallback: (close: { code: number }) => void;
const sendMessage = vi.fn(),
  close = vi.fn();
const message = (id: string, seq: string, key = id): CommunityMessage => ({
  id,
  seq,
  clientMessageId: key,
  author: { memberId: "member-a", name: "Reader" },
  content: "hello",
  status: "ACTIVE",
  createdAt: new Date(0).toISOString(),
  replyTo: null,
});
beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.getState().signIn({
    user: { id: "a", name: "Reader", email: "a@example.invalid" },
    accessToken: "fixture",
  });
  vi.mocked(api.getCommunitySummary).mockResolvedValue(summary);
  vi.mocked(api.joinCommunity).mockResolvedValue(summary);
  vi.mocked(api.listCommunityMessages).mockResolvedValue({
    messages: [],
    hasMore: false,
    nextCursor: null,
    latestEventSeq: "0",
  });
  vi.mocked(api.markCommunityRead).mockImplementation(async (seq) => ({
    ...summary,
    lastReadSeq: seq,
    latestEventSeq: seq,
  }));
  vi.mocked(api.markCommunityVisibleRead).mockResolvedValue({
    ...summary,
    unreadCount: 1,
    mentionUnreadCount: 1,
  });
  vi.mocked(openCommunitySocket).mockImplementation(async (options) => {
    deliver = options.onFrame;
    disconnectCallback = options.onClose;
    return { sendMessage, close };
  });
});
it("reply adds a removable mention independently from the quote", () => {
  const target = {
    ...message("quoted", "1"),
    author: { memberId: "other", name: "青禾" },
  };
  useCommunityStore.getState().setReply(target);
  expect(useCommunityStore.getState().draftMentions).toEqual([
    { memberId: "other", name: "青禾" },
  ]);
  useCommunityStore.getState().removeMention("other");
  expect(useCommunityStore.getState().replyTarget?.id).toBe("quoted");
  useCommunityStore.getState().setReply(target);
  useCommunityStore.getState().setReply(null);
  expect(useCommunityStore.getState().draftMentions).toHaveLength(1);
});
it("opening the room does not acknowledge any offscreen messages", async () => {
  await useCommunityStore.getState().connect();
  useCommunityStore.getState().enterPage();
  expect(api.markCommunityRead).not.toHaveBeenCalled();
  expect(api.markCommunityVisibleRead).not.toHaveBeenCalled();
});
it("preserves a context jump completed before the initial snapshot", async () => {
  let finish!: (
    page: Awaited<ReturnType<typeof api.listCommunityMessages>>,
  ) => void;
  vi.mocked(api.listCommunityMessages).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const connecting = useCommunityStore.getState().connect();
  await vi.waitFor(() => expect(api.listCommunityMessages).toHaveBeenCalled());
  const target = message("target", "1");
  vi.mocked(api.getCommunityMessageContext).mockResolvedValue({
    messages: [target],
    hasOlder: true,
    hasNewer: true,
    latestEventSeq: "10",
  });
  await useCommunityStore.getState().jumpToMessage(target.id);
  finish({
    messages: [message("latest", "10")],
    hasMore: true,
    nextCursor: "10",
    latestEventSeq: "10",
  });
  await connecting;
  expect(useCommunityStore.getState().windowIds).toEqual([target.id]);
  expect(useCommunityStore.getState().jumpTargetId).toBe(target.id);
  expect(useCommunityStore.getState().lastAppliedEventSeq).toBe("10");
});
it("does not let an overlapping summary restore acknowledged mention badges", async () => {
  vi.useFakeTimers();
  await useCommunityStore.getState().connect();
  const incoming = {
    ...message("incoming", "1"),
    author: { memberId: "other", name: "青禾" },
    mentions: [{ memberId: "member-a", name: "Reader" }],
  };
  deliver({ event: "message.created", data: { seq: "1", message: incoming } });
  let finishRead!: (value: typeof summary) => void;
  let finishSummary!: (value: typeof summary) => void;
  const stale = new Promise<typeof summary>((resolve) => {
    finishSummary = resolve;
  });
  vi.mocked(api.getCommunitySummary).mockReturnValueOnce(stale);
  vi.mocked(api.markCommunityVisibleRead).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishRead = resolve;
      }),
  );
  useCommunityStore.setState({ isPageActive: true });
  useCommunityStore.getState().setVisibleMessages([incoming.id]);
  await vi.advanceTimersByTimeAsync(5001);
  finishRead({ ...summary, latestEventSeq: "1" });
  await vi.advanceTimersByTimeAsync(0);
  finishSummary({
    ...summary,
    unreadCount: 1,
    replyUnreadCount: 0,
    latestEventSeq: "1",
    mentionUnreadCount: 1,
  } as typeof summary);
  await vi.advanceTimersByTimeAsync(0);
  expect(useCommunityStore.getState().readMessageIds).toContain(incoming.id);
  expect(useCommunityStore.getState().unreadCount).toBe(0);
  expect(useCommunityStore.getState().mentionUnreadCount).toBe(0);
});
it("reading latest visible messages preserves an earlier offscreen mention", async () => {
  await useCommunityStore.getState().connect();
  vi.mocked(api.markCommunityVisibleRead).mockResolvedValue({
    ...summary,
    unreadCount: 1,
    mentionUnreadCount: 1,
    latestEventSeq: "2",
  });
  const old = {
    ...message("old", "1"),
    author: { memberId: "other", name: "青禾" },
    mentions: [{ memberId: "member-a", name: "Reader" }],
  };
  const latest = { ...message("latest", "2"), author: old.author };
  useCommunityStore.setState({
    messages: [old, latest],
    windowIds: [old.id, latest.id],
    isPageActive: true,
    unreadCount: 2,
    mentionUnreadCount: 1,
  });
  useCommunityStore.getState().setVisibleMessages([latest.id]);
  await vi.waitFor(() =>
    expect(api.markCommunityVisibleRead).toHaveBeenCalledWith(
      [latest.id],
      expect.any(AbortSignal),
    ),
  );
  expect(api.markCommunityRead).not.toHaveBeenCalled();
  expect(useCommunityStore.getState().mentionUnreadCount).toBe(1);
  expect(useCommunityStore.getState().readMessageIds).not.toContain(old.id);
});
it("loads surrounding context for targets outside the 500-message cache", async () => {
  await useCommunityStore.getState().connect();
  const target = message("uncached", "1");
  vi.mocked(api.getCommunityMessageContext).mockResolvedValue({
    messages: [target],
    hasOlder: true,
    hasNewer: true,
    latestEventSeq: "10",
  });
  await useCommunityStore.getState().jumpToMessage(target.id);
  expect(useCommunityStore.getState().windowIds).toEqual([target.id]);
  expect(useCommunityStore.getState().jumpTargetId).toBe(target.id);
  expect(useCommunityStore.getState().atLiveTail).toBe(false);
  expect(api.markCommunityVisibleRead).not.toHaveBeenCalled();
});
it("never marks undisplayed messages read when scrolling back to the old tail", async () => {
  await useCommunityStore.getState().connect();
  useCommunityStore.getState().enterPage();
  useCommunityStore.getState().setAtLiveTail(false);
  deliver({
    event: "message.created",
    data: { seq: "1", message: message("held", "1") },
  });
  useCommunityStore.getState().setAtLiveTail(true);
  await useCommunityStore.getState().markVisibleTailRead();
  expect(api.markCommunityRead).not.toHaveBeenCalled();
  expect(useCommunityStore.getState().atLiveTail).toBe(false);
});
it("merges events received after a latest HTTP snapshot into the visible window", async () => {
  await useCommunityStore.getState().connect();
  let finish!: (
    page: Awaited<ReturnType<typeof api.listCommunityMessages>>,
  ) => void;
  vi.mocked(api.listCommunityMessages).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = useCommunityStore.getState().jumpToLatest();
  deliver({
    event: "message.created",
    data: { seq: "1", message: message("new", "1") },
  });
  finish({
    messages: [],
    hasMore: false,
    nextCursor: null,
    latestEventSeq: "0",
  });
  await pending;
  expect(useCommunityStore.getState().windowIds).toEqual(["new"]);
});
it("clears cancelled history loading on reconnection and ignores the old response", async () => {
  vi.useFakeTimers();
  await useCommunityStore.getState().connect();
  let finish!: (
    page: Awaited<ReturnType<typeof api.listCommunityMessages>>,
  ) => void;
  vi.mocked(api.listCommunityMessages).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = useCommunityStore.getState().loadOlder();
  disconnectCallback({ code: 1006 });
  await vi.advanceTimersByTimeAsync(1201);
  expect(useCommunityStore.getState().historyLoading).toBe(false);
  finish({
    messages: [message("old", "1")],
    hasMore: false,
    nextCursor: null,
    latestEventSeq: "1",
  });
  await pending;
  expect(useCommunityStore.getState().windowIds).not.toContain("old");
});
afterEach(() => {
  useCommunityStore.getState().clearForIdentityChange();
  useAuthStore.getState().clearAuthentication();
  vi.useRealTimers();
});
it("merges ack and event once without advancing event cursor from ack", async () => {
  await useCommunityStore.getState().connect();
  useCommunityStore.getState().setDraft("hello");
  useCommunityStore.getState().send();
  const input = sendMessage.mock.calls[0][0];
  const m = message("m", "1", input.clientMessageId);
  deliver({
    event: "message.ack",
    data: { clientMessageId: input.clientMessageId, message: m },
  });
  expect(useCommunityStore.getState().lastAppliedEventSeq).toBe("0");
  deliver({ event: "message.created", data: { seq: "1", message: m } });
  expect(useCommunityStore.getState().messages).toHaveLength(1);
  expect(useCommunityStore.getState().pendingMessages).toHaveLength(0);
});
it("keeps idempotency key after lost ack and retries only manually", async () => {
  vi.useFakeTimers();
  await useCommunityStore.getState().connect();
  useCommunityStore.getState().setDraft("hello");
  useCommunityStore.getState().send();
  const key = sendMessage.mock.calls[0][0].clientMessageId;
  await vi.advanceTimersByTimeAsync(10001);
  expect(sendMessage).toHaveBeenCalledTimes(1);
  expect(useCommunityStore.getState().pendingMessages[0].status).toBe("failed");
  useCommunityStore.getState().retry(key);
  expect(sendMessage.mock.calls[1][0].clientMessageId).toBe(key);
});
it("clears drafts immediately on account switch and ignores old callback", async () => {
  await useCommunityStore.getState().connect();
  useCommunityStore.getState().setDraft("private draft");
  const old = deliver;
  useAuthStore.getState().signIn({
    user: { id: "b", name: "B", email: "b@example.invalid" },
    accessToken: "b",
  });
  old({
    event: "message.created",
    data: { seq: "1", message: message("m", "1") },
  });
  expect(useCommunityStore.getState().draft).toBe("");
  expect(useCommunityStore.getState().messages).toHaveLength(0);
});
it("redacts every cached quote when the original is removed", async () => {
  await useCommunityStore.getState().connect();
  const original = message("original", "1");
  deliver({ event: "message.created", data: { seq: "1", message: original } });
  deliver({
    event: "message.created",
    data: {
      seq: "2",
      message: {
        ...message("reply", "2"),
        replyTo: {
          id: "original",
          memberId: "member-a",
          name: "Reader",
          excerpt: "secret",
          status: "ACTIVE",
        },
      },
    },
  });
  useCommunityStore.getState().setReply(original);
  deliver({
    event: "message.removed",
    data: {
      seq: "3",
      message: { ...original, status: "REMOVED", content: null },
    },
  });
  expect(useCommunityStore.getState().messages[1].replyTo?.excerpt).toBeNull();
  expect(useCommunityStore.getState().replyTarget).toBeNull();
});
it("holds reading window while scrolled up and never marks background read", async () => {
  await useCommunityStore.getState().connect();
  useCommunityStore.getState().setAtLiveTail(false);
  deliver({
    event: "message.created",
    data: { seq: "1", message: message("m", "1") },
  });
  expect(useCommunityStore.getState().windowIds).toHaveLength(0);
  expect(useCommunityStore.getState().unseenNewCount).toBe(1);
  await useCommunityStore.getState().markVisibleTailRead();
  expect(api.markCommunityRead).not.toHaveBeenCalled();
});
it("caps background cache and does not replace the protected reading window", async () => {
  await useCommunityStore.getState().connect();
  deliver({
    event: "message.created",
    data: { seq: "1", message: message("anchor", "1") },
  });
  useCommunityStore.getState().setAtLiveTail(false);
  for (let n = 2; n <= 601; n++)
    deliver({
      event: "message.created",
      data: { seq: String(n), message: message(`m${n}`, String(n)) },
    });
  expect(useCommunityStore.getState().messages).toHaveLength(500);
  expect(useCommunityStore.getState().windowIds).toEqual(["anchor"]);
  expect(
    useCommunityStore.getState().messages.some((m) => m.id === "anchor"),
  ).toBe(true);
});
it("limits pending sends without replacing their stable request keys", async () => {
  await useCommunityStore.getState().connect();
  for (let n = 0; n < 21; n++) {
    useCommunityStore.getState().setDraft(`pending ${n}`);
    useCommunityStore.getState().send();
  }
  expect(useCommunityStore.getState().pendingMessages).toHaveLength(20);
  expect(sendMessage).toHaveBeenCalledTimes(20);
  expect(useCommunityStore.getState().draft).toBe("pending 20");
});
it("stops after five short failed connections instead of resetting on open", async () => {
  vi.useFakeTimers();
  await useCommunityStore.getState().connect();
  for (let n = 0; n < 5; n++) {
    disconnectCallback({ code: 1006 });
    await vi.advanceTimersByTimeAsync(20000);
  }
  expect(openCommunitySocket).toHaveBeenCalledTimes(5);
  expect(useCommunityStore.getState().connectionStatus).toBe("offline");
});
