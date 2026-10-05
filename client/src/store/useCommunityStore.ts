import { create } from "zustand";
import { useAuthStore } from "./useAuthStore";
import {
  CommunityApiError,
  communityErrorText,
  getCommunitySummary,
  joinCommunity,
  listCommunityMessages,
  markCommunityVisibleRead,
  getCommunityMessageContext,
  getCommunityUnreadTarget,
  removeCommunityMessage,
  hideCommunityMessage,
} from "@/lib/community-api";
import { refreshAuthentication } from "@/lib/api";
import {
  openCommunitySocket,
  type CommunitySocket,
  type CommunityClose,
} from "@/lib/community-socket";
import type {
  CommunityFrame,
  CommunityMessage,
  CommunitySend,
  CommunitySummary,
  CommunityMention,
} from "@/lib/community-types";

export interface PendingCommunityMessage extends CommunitySend {
  status: "sending" | "failed";
  error?: string;
  createdAt: string;
}
interface CommunityState {
  membership: CommunitySummary | null;
  membershipChecked: boolean;
  connectionStatus: "idle" | "connecting" | "syncing" | "online" | "offline";
  messages: CommunityMessage[];
  pendingMessages: PendingCommunityMessage[];
  windowIds: string[];
  draft: string;
  replyTarget: CommunityMessage | null;
  draftMentions: CommunityMention[];
  mentionUnreadCount: number;
  readMessageIds: string[];
  visibleMessageIds: string[];
  jumpTargetId: string | null;
  jumpVersion: number;
  jumpLoading: boolean;
  lastMentionSeq: string | null;
  error: string | null;
  isPageActive: boolean;
  atLiveTail: boolean;
  windowAtLatest: boolean;
  lastAppliedEventSeq: string;
  unreadCount: number;
  replyUnreadCount: number;
  unseenNewCount: number;
  onlineCount: number;
  historyLoading: boolean;
  hasOlder: boolean;
  hasNewer: boolean;
  connect(): Promise<void>;
  disconnect(): void;
  join(): Promise<void>;
  enterPage(): void;
  leavePage(): void;
  setDraft(value: string): void;
  setReply(message: CommunityMessage | null): void;
  addMention(member: CommunityMention): void;
  removeMention(id: string): void;
  setVisibleMessages(ids: string[]): void;
  jumpToMessage(id: string): Promise<void>;
  jumpToUnread(mentionOnly: boolean, next?: boolean): Promise<void>;
  setAtLiveTail(value: boolean): void;
  send(): void;
  retry(key: string): void;
  discard(key: string): void;
  remove(id: string): Promise<void>;
  hide(id: string, reason: string): Promise<void>;
  loadOlder(): Promise<void>;
  loadNewer(): Promise<void>;
  jumpToLatest(): Promise<void>;
  markVisibleTailRead(): Promise<void>;
  clearForIdentityChange(): void;
}
const initial = () => ({
  membership: null,
  membershipChecked: false,
  connectionStatus: "idle" as const,
  messages: [],
  pendingMessages: [],
  windowIds: [],
  draft: "",
  replyTarget: null,
  draftMentions: [],
  mentionUnreadCount: 0,
  readMessageIds: [],
  visibleMessageIds: [],
  jumpTargetId: null,
  jumpVersion: 0,
  jumpLoading: false,
  lastMentionSeq: null,
  error: null,
  isPageActive: false,
  atLiveTail: true,
  windowAtLatest: true,
  lastAppliedEventSeq: "0",
  unreadCount: 0,
  replyUnreadCount: 0,
  unseenNewCount: 0,
  onlineCount: 0,
  historyLoading: false,
  hasOlder: false,
  hasNewer: false,
});
let socket: CommunitySocket | null = null,
  controller: AbortController | null = null,
  generation = 0,
  failures = 0,
  refreshed = false,
  running = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined,
  stableTimer: ReturnType<typeof setTimeout> | undefined,
  readTimer: ReturnType<typeof setTimeout> | undefined,
  summaryTimer: ReturnType<typeof setTimeout> | undefined;
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
let summaryVersion = 0,
  readInFlight = false,
  lastReadTime = 0,
  historyVersion = 0;
let navigationVersion = 0;
const valid = (version: number) =>
  version === generation && !controller?.signal.aborted;
const errorText = (error: unknown) =>
  error instanceof CommunityApiError
    ? communityErrorText(error.code)
    : "聊天室连接失败，请重试";
const compare = (a: CommunityMessage, b: CommunityMessage) =>
  BigInt(a.seq) < BigInt(b.seq) ? -1 : BigInt(a.seq) > BigInt(b.seq) ? 1 : 0;
function clearPendingTimer(key: string) {
  clearTimeout(pendingTimers.get(key));
  pendingTimers.delete(key);
}
function merge(
  messages: CommunityMessage[],
  incoming: CommunityMessage[],
  windowIds: string[],
): CommunityMessage[] {
  const map = new Map(messages.map((m) => [m.id, m]));
  for (const message of incoming) {
    const old = map.get(message.id);
    map.set(
      message.id,
      old?.status === "REMOVED"
        ? { ...message, content: null, status: "REMOVED" }
        : message,
    );
  }
  const removed = new Set(
    [...map.values()].filter((m) => m.status === "REMOVED").map((m) => m.id),
  );
  for (const [id, m] of map)
    if (m.replyTo && removed.has(m.replyTo.id))
      map.set(id, {
        ...m,
        replyTo: { ...m.replyTo, status: "REMOVED", excerpt: null },
      });
  const sorted = [...map.values()].sort(compare);
  const protectedIds = new Set(windowIds);
  let excess = sorted.length - 500;
  return sorted.filter((m) => {
    if (excess > 0 && !protectedIds.has(m.id)) {
      excess--;
      return false;
    }
    return true;
  });
}
function applySummary(summary: CommunitySummary, version: number) {
  if (!valid(version)) return;
  const state = useCommunityStore.getState();
  if (
    state.membership &&
    BigInt(summary.lastReadSeq) < BigInt(state.membership.lastReadSeq)
  )
    return;
  if (
    state.membership &&
    BigInt(summary.latestEventSeq) < BigInt(state.membership.latestEventSeq)
  )
    return;
  // Events arriving after this snapshot retain their local unread contribution.
  const extra = state.messages.filter(
    (m) =>
      BigInt(m.seq) > BigInt(summary.latestEventSeq) &&
      m.status === "ACTIVE" &&
      !state.readMessageIds.includes(m.id) &&
      m.author.memberId !== summary.memberId,
  );
  useCommunityStore.setState({
    membership: summary,
    membershipChecked: true,
    unreadCount: summary.unreadCount + extra.length,
    replyUnreadCount:
      summary.replyUnreadCount +
      extra.filter((m) => m.replyTo?.memberId === summary.memberId).length,
    mentionUnreadCount:
      (summary.mentionUnreadCount ?? 0) +
      extra.filter((m) =>
        m.mentions?.some((t) => t.memberId === summary.memberId),
      ).length,
  });
}
function refreshSummary(version: number) {
  clearTimeout(summaryTimer);
  summaryTimer = setTimeout(() => {
    if (!valid(version)) return;
    // Receipt writes do not advance event cursors; a pre-commit GET cannot
    // supersede the summary returned by the write.
    if (readInFlight) {
      refreshSummary(version);
      return;
    }
    const request = ++summaryVersion;
    void getCommunitySummary(controller?.signal)
      .then((summary) => {
        if (request === summaryVersion) applySummary(summary, version);
      })
      .catch(() => {});
  }, 5000);
}
function mergeMessage(message: CommunityMessage, created: boolean) {
  const state = useCommunityStore.getState();
  clearPendingTimer(message.clientMessageId);
  const exists = state.messages.some((m) => m.id === message.id);
  let ids = state.windowIds;
  if (created && !exists && state.atLiveTail && state.windowAtLatest)
    ids = [...ids, message.id].slice(-100);
  const messages = merge(state.messages, [message], ids);
  useCommunityStore.setState({
    messages,
    windowIds: ids,
    pendingMessages: state.pendingMessages.filter(
      (p) => p.clientMessageId !== message.clientMessageId,
    ),
    replyTarget:
      state.replyTarget?.id === message.id && message.status === "REMOVED"
        ? null
        : state.replyTarget,
    unseenNewCount:
      created && !exists && (!state.atLiveTail || !state.windowAtLatest)
        ? state.unseenNewCount + 1
        : state.unseenNewCount,
  });
}
function frame(frame: CommunityFrame, version: number) {
  if (!valid(version)) return;
  const state = useCommunityStore.getState();
  if ("seq" in frame.data) {
    if (BigInt(frame.data.seq) <= BigInt(state.lastAppliedEventSeq)) return;
    useCommunityStore.setState({ lastAppliedEventSeq: frame.data.seq });
    if (
      frame.event === "message.created" ||
      frame.event === "message.removed"
    ) {
      const m = frame.data.message;
      const old = state.messages.find((x) => x.id === m.id);
      mergeMessage(m, frame.event === "message.created");
      if (
        state.membership &&
        BigInt(frame.data.seq) > BigInt(state.membership.latestEventSeq)
      ) {
        if (
          frame.event === "message.created" &&
          m.status === "ACTIVE" &&
          m.author.memberId !== state.membership.memberId
        )
          useCommunityStore.setState((s) => ({
            unreadCount: s.unreadCount + 1,
            replyUnreadCount:
              s.replyUnreadCount +
              (m.replyTo?.memberId === s.membership?.memberId ? 1 : 0),
            mentionUnreadCount:
              s.mentionUnreadCount +
              (m.mentions?.some((t) => t.memberId === s.membership?.memberId)
                ? 1
                : 0),
          }));
        if (
          frame.event === "message.removed" &&
          old?.status === "ACTIVE" &&
          old.author.memberId !== state.membership.memberId &&
          !state.readMessageIds.includes(old.id) &&
          BigInt(old.seq) > BigInt(state.membership.lastReadSeq)
        )
          useCommunityStore.setState((s) => ({
            unreadCount: Math.max(0, s.unreadCount - 1),
            replyUnreadCount: Math.max(
              0,
              s.replyUnreadCount -
                (old.replyTo?.memberId === s.membership?.memberId ? 1 : 0),
            ),
            mentionUnreadCount: Math.max(
              0,
              s.mentionUnreadCount -
                (old.mentions?.some(
                  (t) => t.memberId === s.membership?.memberId,
                )
                  ? 1
                  : 0),
            ),
          }));
      }
      refreshSummary(version);
    }
    void useCommunityStore.getState().markVisibleTailRead();
    return;
  }
  switch (frame.event) {
    case "connection.ready":
      useCommunityStore.setState({ connectionStatus: "syncing" });
      break;
    case "presence":
      useCommunityStore.setState({ onlineCount: frame.data.onlineCount });
      break;
    case "message.ack":
      mergeMessage(frame.data.message, true);
      break;
    case "error": {
      const error = communityErrorText(frame.data.code);
      const key = frame.data.clientMessageId;
      if (key) {
        clearPendingTimer(key);
        useCommunityStore.setState((s) => ({
          pendingMessages: s.pendingMessages.map((p) =>
            p.clientMessageId === key ? { ...p, status: "failed", error } : p,
          ),
        }));
      }
      useCommunityStore.setState({ error });
      refreshSummary(version);
      break;
    }
    case "reset":
      resetSnapshot();
      break;
  }
}
function resetSnapshot() {
  historyVersion++;
  navigationVersion++;
  useCommunityStore.setState({
    messages: [],
    windowIds: [],
    replyTarget: null,
    lastAppliedEventSeq: "0",
    windowAtLatest: true,
    atLiveTail: true,
    unseenNewCount: 0,
  });
}
function release() {
  controller?.abort();
  controller = null;
  socket?.close();
  socket = null;
  clearTimeout(retryTimer);
  clearTimeout(stableTimer);
  clearTimeout(readTimer);
  clearTimeout(summaryTimer);
  generation++;
  summaryVersion++;
  historyVersion++;
  navigationVersion++;
  readInFlight = false;
  useCommunityStore.setState({ historyLoading: false, jumpLoading: false });
}
function closed(close: CommunityClose, version: number) {
  if (!valid(version)) return;
  socket = null;
  clearTimeout(stableTimer);
  useCommunityStore.setState({ connectionStatus: "offline" });
  for (const key of pendingTimers.keys()) clearPendingTimer(key);
  useCommunityStore.setState((s) => ({
    pendingMessages: s.pendingMessages.map((p) => ({
      ...p,
      status: "failed",
      error: "发送结果未确认，可手动重试",
    })),
  }));
  if (close.code === 4009 || close.code === 4010) resetSnapshot();
  if ([4003, 1008, 1009].includes(close.code)) {
    running = false;
    useCommunityStore.setState({
      error:
        close.code === 4003
          ? "登录或成员权限已失效"
          : "连接协议异常，请刷新页面",
    });
    return;
  }
  if (close.code === 4001) {
    if (refreshed) {
      running = false;
      useCommunityStore.setState({ error: "登录已过期，请重新登录" });
      return;
    }
    refreshed = true;
    void refreshAuthentication({ signal: controller?.signal }).then(
      (status) => {
        if (!valid(version)) return;
        if (status === "authenticated") schedule(version);
        else {
          running = false;
          useCommunityStore.setState({ error: "登录已过期，请重新登录" });
        }
      },
    );
    return;
  }
  schedule(version);
}
function schedule(version: number, retryAfter = 0) {
  if (!valid(version) || !running) return;
  failures++;
  if (failures >= 5) {
    running = false;
    useCommunityStore.setState({ error: "连续连接失败，请检查网络后手动重连" });
    return;
  }
  const delay = Math.max(
    retryAfter * 1000,
    2 ** (failures - 1) * 1000 * (1 + Math.random() * 0.2),
  );
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    if (valid(version) && running) void establish();
  }, delay);
}
async function snapshot(version: number) {
  const navigation = navigationVersion;
  const history = historyVersion;
  const page = await listCommunityMessages({}, controller?.signal);
  if (!valid(version)) return;
  useCommunityStore.setState((s) => {
    const replaceWindow =
      navigation === navigationVersion && history === historyVersion;
    const ids = replaceWindow ? page.messages.map((m) => m.id) : s.windowIds;
    return {
      messages: merge(s.messages, page.messages, ids),
      // Always initialize replay, even when a newer navigation owns the window.
      lastAppliedEventSeq: page.latestEventSeq,
      ...(replaceWindow
        ? {
            windowIds: ids,
            hasOlder: page.hasMore,
            hasNewer: false,
            windowAtLatest: true,
            unseenNewCount: 0,
          }
        : {}),
    };
  });
}
async function establish() {
  release();
  const version = generation;
  controller = new AbortController();
  const signal = controller.signal;
  let handledClose = false;
  useCommunityStore.setState({ connectionStatus: "connecting", error: null });
  try {
    const summary = await getCommunitySummary(signal);
    if (!valid(version)) return;
    applySummary(summary, version);
    if (useCommunityStore.getState().lastAppliedEventSeq === "0")
      await snapshot(version);
    if (!valid(version)) return;
    const connection = await openCommunitySocket({
      after: useCommunityStore.getState().lastAppliedEventSeq,
      signal,
      onFrame: (f) => frame(f, version),
      onClose: (c) => {
        handledClose = true;
        closed(c, version);
      },
    });
    if (!valid(version)) {
      connection.close();
      return;
    }
    socket = connection;
    useCommunityStore.setState({ connectionStatus: "online" });
    stableTimer = setTimeout(() => {
      if (valid(version)) {
        failures = 0;
        refreshed = false;
      }
    }, 30000);
    refreshSummary(version);
    void useCommunityStore.getState().markVisibleTailRead();
  } catch (error) {
    if (!valid(version) || handledClose) return;
    if (
      error instanceof CommunityApiError &&
      error.code === "COMMUNITY_JOIN_REQUIRED"
    ) {
      running = false;
      useCommunityStore.setState({
        membership: null,
        membershipChecked: true,
        connectionStatus: "idle",
        error: null,
      });
      return;
    }
    useCommunityStore.setState({
      membershipChecked: true,
      connectionStatus: "offline",
      error: errorText(error),
    });
    if (
      error instanceof CommunityApiError &&
      [400, 401, 403].includes(error.status)
    ) {
      running = false;
      return;
    }
    schedule(
      version,
      error instanceof CommunityApiError ? error.retryAfterSeconds : undefined,
    );
  }
}
function transmit(pending: PendingCommunityMessage) {
  const state = useCommunityStore.getState();
  if (!socket || state.connectionStatus !== "online") return;
  clearPendingTimer(pending.clientMessageId);
  useCommunityStore.setState((s) => ({
    pendingMessages: s.pendingMessages.map((p) =>
      p.clientMessageId === pending.clientMessageId
        ? { ...p, status: "sending", error: undefined }
        : p,
    ),
  }));
  try {
    socket.sendMessage({
      clientMessageId: pending.clientMessageId,
      content: pending.content,
      ...(pending.replyToId ? { replyToId: pending.replyToId } : {}),
      ...(pending.mentionMemberIds?.length
        ? { mentionMemberIds: pending.mentionMemberIds }
        : {}),
    });
  } catch {
    useCommunityStore.setState((s) => ({
      pendingMessages: s.pendingMessages.map((p) =>
        p.clientMessageId === pending.clientMessageId
          ? { ...p, status: "failed", error: "连接已断开" }
          : p,
      ),
    }));
    return;
  }
  const version = generation;
  pendingTimers.set(
    pending.clientMessageId,
    setTimeout(() => {
      if (valid(version))
        useCommunityStore.setState((s) => ({
          pendingMessages: s.pendingMessages.map((p) =>
            p.clientMessageId === pending.clientMessageId
              ? { ...p, status: "failed", error: "发送结果未确认，可手动重试" }
              : p,
          ),
        }));
      clearPendingTimer(pending.clientMessageId);
    }, 10000),
  );
}
async function history(direction: "older" | "newer" | "latest") {
  const state = useCommunityStore.getState();
  if (state.historyLoading || !state.membership) return;
  const version = generation,
    request = ++historyVersion;
  useCommunityStore.setState({ historyLoading: true, error: null });
  const visible = state.windowIds
    .map((id) => state.messages.find((m) => m.id === id))
    .filter((m): m is CommunityMessage => !!m);
  try {
    const page = await listCommunityMessages(
      direction === "older"
        ? { before: visible[0]?.seq }
        : direction === "newer"
          ? { after: visible[visible.length - 1]?.seq }
          : {},
      controller?.signal,
    );
    if (!valid(version) || request !== historyVersion) return;
    const receivedAfterSnapshot = useCommunityStore
      .getState()
      .messages.filter((m) => BigInt(m.seq) > BigInt(page.latestEventSeq))
      .map((m) => m.id);
    const ids =
      direction === "latest"
        ? [...page.messages.map((m) => m.id), ...receivedAfterSnapshot]
        : [
            ...new Set(
              direction === "older"
                ? [...page.messages.map((m) => m.id), ...state.windowIds]
                : [...state.windowIds, ...page.messages.map((m) => m.id)],
            ),
          ];
    const windowIds =
      direction === "older" ? ids.slice(0, 100) : ids.slice(-100);
    useCommunityStore.setState((s) => ({
      messages: merge(s.messages, page.messages, windowIds),
      windowIds,
      windowAtLatest:
        direction === "latest" || (direction === "newer" && !page.hasMore),
      atLiveTail: direction === "latest",
      hasOlder:
        direction === "older"
          ? page.hasMore
          : direction === "latest"
            ? page.hasMore
            : true,
      hasNewer:
        direction === "older" || (direction === "newer" && page.hasMore),
      unseenNewCount: direction === "latest" ? 0 : s.unseenNewCount,
    }));
  } catch (error) {
    if (valid(version)) useCommunityStore.setState({ error: errorText(error) });
  } finally {
    if (valid(version) && request === historyVersion)
      useCommunityStore.setState({ historyLoading: false });
  }
}
export const useCommunityStore = create<CommunityState>((set, get) => ({
  ...initial(),
  async connect() {
    if (running) return;
    running = true;
    failures = 0;
    refreshed = false;
    await establish();
  },
  disconnect() {
    running = false;
    release();
    set((s) => ({
      connectionStatus: "idle",
      historyLoading: false,
      pendingMessages: s.pendingMessages.map((p) => ({
        ...p,
        status: "failed",
      })),
    }));
  },
  async join() {
    const auth = useAuthStore.getState(),
      version = generation;
    try {
      const summary = await joinCommunity();
      if (
        version !== generation ||
        auth.authGeneration !== useAuthStore.getState().authGeneration
      )
        return;
      set({ membership: summary, membershipChecked: true });
      await get().connect();
    } catch (error) {
      if (version === generation) set({ error: errorText(error) });
    }
  },
  enterPage() {
    set({ isPageActive: true, visibleMessageIds: [] });
    if (
      get().membership &&
      (!get().windowAtLatest || !get().atLiveTail || get().unseenNewCount > 0)
    )
      void get().jumpToLatest();
  },
  leavePage() {
    set({ isPageActive: false, visibleMessageIds: [] });
  },
  setDraft: (draft) => set({ draft }),
  setReply(replyTarget) {
    set({ replyTarget });
    if (replyTarget) get().addMention(replyTarget.author);
  },
  addMention(member) {
    const current = get().draftMentions;
    if (
      current.length < 10 &&
      !current.some((m) => m.memberId === member.memberId)
    )
      set({ draftMentions: [...current, member] });
  },
  removeMention(id) {
    set((s) => ({
      draftMentions: s.draftMentions.filter((m) => m.memberId !== id),
    }));
  },
  setVisibleMessages(ids) {
    set({ visibleMessageIds: ids.slice(0, 100) });
    void get().markVisibleTailRead();
  },
  setAtLiveTail(value) {
    const state = get();
    const atLiveTail =
      value && state.windowAtLatest && state.unseenNewCount === 0;
    set({ atLiveTail });
    if (atLiveTail) void get().markVisibleTailRead();
  },
  send() {
    const s = get(),
      content = s.draft.trim();
    if (
      s.connectionStatus !== "online" ||
      !content ||
      Array.from(content).length > 2000 ||
      s.pendingMessages.length >= 20
    )
      return;
    const pending: PendingCommunityMessage = {
      clientMessageId: crypto.randomUUID(),
      content,
      status: "sending",
      createdAt: new Date().toISOString(),
      ...(s.replyTarget ? { replyToId: s.replyTarget.id } : {}),
      ...(s.draftMentions.length
        ? { mentionMemberIds: s.draftMentions.map((m) => m.memberId) }
        : {}),
    };
    set({
      pendingMessages: [...s.pendingMessages, pending],
      draft: "",
      replyTarget: null,
      draftMentions: [],
    });
    transmit(pending);
  },
  retry(key) {
    const pending = get().pendingMessages.find(
      (p) => p.clientMessageId === key,
    );
    if (pending) transmit(pending);
  },
  discard(key) {
    clearPendingTimer(key);
    set((s) => ({
      pendingMessages: s.pendingMessages.filter(
        (p) => p.clientMessageId !== key,
      ),
    }));
  },
  async remove(id) {
    const version = generation;
    try {
      const message = await removeCommunityMessage(id, controller?.signal);
      if (valid(version)) mergeMessage(message, false);
    } catch (error) {
      if (valid(version)) set({ error: errorText(error) });
    }
  },
  async hide(id, reason) {
    const version = generation;
    const message = await hideCommunityMessage(id, reason, controller?.signal);
    if (valid(version)) mergeMessage(message, false);
  },
  loadOlder: () => history("older"),
  loadNewer: () => history("newer"),
  async jumpToLatest() {
    navigationVersion++;
    historyVersion++;
    set({
      jumpTargetId: null,
      jumpLoading: false,
      historyLoading: false,
      visibleMessageIds: [],
    });
    await history("latest");
  },
  async jumpToMessage(id) {
    const version = generation,
      request = ++navigationVersion;
    historyVersion++;
    set({
      jumpLoading: true,
      historyLoading: false,
      error: null,
      atLiveTail: false,
      visibleMessageIds: [],
    });
    try {
      const page = await getCommunityMessageContext(id, controller?.signal);
      if (!valid(version) || request !== navigationVersion) return;
      const ids = page.messages.map((m) => m.id);
      set((s) => ({
        messages: merge(s.messages, page.messages, ids),
        windowIds: ids,
        hasOlder: page.hasOlder,
        hasNewer: page.hasNewer,
        windowAtLatest: !page.hasNewer,
        atLiveTail: false,
        jumpTargetId: id,
        jumpVersion: s.jumpVersion + 1,
      }));
    } catch (error) {
      if (valid(version) && request === navigationVersion)
        set({ error: errorText(error) });
    } finally {
      if (valid(version) && request === navigationVersion)
        set({ jumpLoading: false });
    }
  },
  async jumpToUnread(mentionOnly, next = false) {
    if (get().jumpLoading) return;
    const version = generation,
      request = ++navigationVersion;
    set({ jumpLoading: true, error: null });
    try {
      const target = await getCommunityUnreadTarget(
        mentionOnly,
        controller?.signal,
        next ? (get().lastMentionSeq ?? undefined) : undefined,
      );
      if (!valid(version) || request !== navigationVersion) return;
      if (!target) {
        set({
          error: mentionOnly ? "没有待看的 @ 消息了" : "没有待看的未读消息了",
        });
        return;
      }
      if (mentionOnly) set({ lastMentionSeq: target.seq });
      await get().jumpToMessage(target.id);
    } catch (error) {
      if (valid(version) && request === navigationVersion)
        set({ error: errorText(error) });
    } finally {
      if (valid(version) && request === navigationVersion)
        set({ jumpLoading: false });
    }
  },
  async markVisibleTailRead() {
    const s = get();
    if (
      !s.isPageActive ||
      document.visibilityState === "hidden" ||
      s.connectionStatus !== "online" ||
      !s.membership ||
      readInFlight
    )
      return;
    const ids = s.visibleMessageIds.filter(
      (id) =>
        !s.readMessageIds.includes(id) &&
        s.messages.some(
          (m) =>
            m.id === id &&
            m.status === "ACTIVE" &&
            m.author.memberId !== s.membership?.memberId &&
            BigInt(m.seq) > BigInt(s.membership!.lastReadSeq),
        ),
    );
    if (!ids.length) return;
    const elapsed = Date.now() - lastReadTime;
    if (elapsed < 2000) {
      clearTimeout(readTimer);
      readTimer = setTimeout(
        () => void get().markVisibleTailRead(),
        2000 - elapsed,
      );
      return;
    }
    readInFlight = true;
    lastReadTime = Date.now();
    const version = generation,
      request = ++summaryVersion;
    let success = false;
    try {
      const summary = await markCommunityVisibleRead(ids, controller?.signal);
      if (valid(version))
        set((current) => ({
          readMessageIds: [
            ...new Set([...current.readMessageIds, ...ids]),
          ].slice(-500),
        }));
      if (request === summaryVersion) applySummary(summary, version);
      success = true;
    } catch {
      if (valid(version)) set({ error: "已读状态未同步，将在重新连接后恢复" });
    } finally {
      if (valid(version)) {
        readInFlight = false;
        if (success) void get().markVisibleTailRead();
      }
    }
  },
  clearForIdentityChange() {
    running = false;
    release();
    for (const key of pendingTimers.keys()) clearPendingTimer(key);
    failures = 0;
    refreshed = false;
    lastReadTime = 0;
    set(initial());
  },
}));
// Public drafts and callbacks belong to one authentication generation, including same-account re-login.
useAuthStore.subscribe((next, previous) => {
  if (
    next.authGeneration !== previous.authGeneration ||
    next.user?.id !== previous.user?.id
  )
    useCommunityStore.getState().clearForIdentityChange();
});
