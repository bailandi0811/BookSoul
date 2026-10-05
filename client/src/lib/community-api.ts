import { apiFetch } from "./api";
import { useAuthStore } from "@/store/useAuthStore";
import type {
  CommunityMessage,
  CommunityMessagePage,
  CommunitySummary,
  CommunityPublicMember,
  CommunityMessageContext,
} from "./community-types";

export class CommunityApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(communityErrorText(code));
  }
}
export function communityErrorText(code: string): string {
  const messages: Record<string, string> = {
    COMMUNITY_JOIN_REQUIRED: "请先加入书友客厅",
    COMMUNITY_RATE_LIMITED: "发言太快了，喝杯茶再聊",
    COMMUNITY_REPLY_UNAVAILABLE: "引用的消息已移除，请取消引用后重试",
    COMMUNITY_MESSAGE_NOT_FOUND: "消息已不可用",
    COMMUNITY_NOT_AUTHOR: "只能撤回自己的消息",
    COMMUNITY_AUTH_INVALID: "登录已失效，请重新登录",
    COMMUNITY_MODERATOR_REQUIRED: "只有管理员可以执行此操作",
    COMMUNITY_CANNOT_MUTE_MODERATOR: "不能禁言管理员",
    COMMUNITY_CANNOT_MUTE_SELF: "不能禁言自己",
    COMMUNITY_MEMBERSHIP_REQUIRED: "请先加入书友客厅",
    COMMUNITY_MUTED: "你暂时被禁言，请稍后再试",
    COMMUNITY_RATE_LIMIT: "发言太快了，喝杯茶再聊",
    COMMUNITY_CONNECTION_LIMIT: "连接已满，请关闭其他聊天室标签页后重试",
    COMMUNITY_REPLY_REMOVED: "引用的消息已移除，请取消引用后重试",
    COMMUNITY_IDEMPOTENCY_CONFLICT: "重试内容与原消息不同",
    COMMUNITY_FORBIDDEN: "没有执行此操作的权限",
    COMMUNITY_AUTH_REQUIRED: "登录已失效，请重新登录",
    COMMUNITY_INVALID_CONTENT: "请输入 1–2000 字的消息",
    COMMUNITY_NOT_FOUND: "消息已不可用",
  };
  return messages[code] ?? "聊天室暂时不可用，请重试";
}
export function record(
  value: unknown,
  keys?: string[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("无效的聊天室响应");
  const result = value as Record<string, unknown>;
  if (keys && Object.keys(result).some((key) => !keys.includes(key)))
    throw new Error("无效的聊天室字段");
  return result;
}
export function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("无效的聊天室文本");
  return value;
}
export function sequence(value: unknown): string {
  const result = text(value);
  if (
    !/^(0|[1-9]\d{0,18})$/.test(result) ||
    BigInt(result) > 9223372036854775807n
  )
    throw new Error("无效的聊天室序列");
  return result;
}
export function count(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new Error("无效的聊天室计数");
  return value as number;
}
function bool(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("无效的聊天室状态");
  return value;
}
function date(value: unknown): string {
  const result = text(value);
  if (!Number.isFinite(Date.parse(result))) throw new Error("无效的聊天室时间");
  return result;
}
function status(value: unknown): "ACTIVE" | "REMOVED" {
  if (value !== "ACTIVE" && value !== "REMOVED")
    throw new Error("无效的消息状态");
  return value;
}
export function parseCommunityMessage(value: unknown): CommunityMessage {
  const m = record(value, [
    "id",
    "seq",
    "clientMessageId",
    "author",
    "content",
    "status",
    "createdAt",
    "replyTo",
    "mentions",
  ]);
  const author = record(m.author, ["memberId", "name"]);
  const state = status(m.status);
  const content = m.content === null ? null : text(m.content);
  if (
    (state === "REMOVED" && content !== null) ||
    (content !== null && Array.from(content).length > 2000)
  )
    throw new Error("无效的消息正文");
  let replyTo: CommunityMessage["replyTo"] = null;
  if (m.replyTo !== null) {
    const r = record(m.replyTo, [
      "id",
      "memberId",
      "name",
      "excerpt",
      "status",
    ]);
    const rs = status(r.status);
    const excerpt = r.excerpt === null ? null : text(r.excerpt);
    if (
      (rs === "REMOVED" && excerpt !== null) ||
      (excerpt !== null && Array.from(excerpt).length > 120)
    )
      throw new Error("无效的引用");
    replyTo = {
      id: text(r.id),
      memberId: text(r.memberId),
      name: text(r.name),
      excerpt,
      status: rs,
    };
  }
  return {
    id: text(m.id),
    seq: sequence(m.seq),
    clientMessageId: text(m.clientMessageId),
    author: { memberId: text(author.memberId), name: text(author.name) },
    content,
    status: state,
    createdAt: date(m.createdAt),
    mentions: m.mentions === undefined ? [] : parseMentions(m.mentions),
    replyTo,
  };
}
export function parseCommunitySummary(value: unknown): CommunitySummary {
  const s = record(value, [
    "memberId",
    "isModerator",
    "mutedUntil",
    "lastReadSeq",
    "unreadCount",
    "replyUnreadCount",
    "latestEventSeq",
    "mentionUnreadCount",
    "consentVersion",
  ]);
  return {
    memberId: text(s.memberId),
    isModerator: bool(s.isModerator),
    mutedUntil: s.mutedUntil === null ? null : date(s.mutedUntil),
    lastReadSeq: sequence(s.lastReadSeq),
    unreadCount: count(s.unreadCount),
    replyUnreadCount: count(s.replyUnreadCount),
    latestEventSeq: sequence(s.latestEventSeq),
    mentionUnreadCount:
      s.mentionUnreadCount === undefined ? 0 : count(s.mentionUnreadCount),
    consentVersion:
      s.consentVersion === undefined ? "2026-10-04" : text(s.consentVersion),
  };
}
async function request(
  path: string,
  options: RequestInit = {},
  signal?: AbortSignal,
): Promise<unknown> {
  const identity = useAuthStore.getState();
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timeout = setTimeout(abort, 10000);
  const current = () => {
    controller.signal.throwIfAborted();
    const auth = useAuthStore.getState();
    if (
      auth.authGeneration !== identity.authGeneration ||
      auth.user?.id !== identity.user?.id
    )
      throw new Error("登录身份已变化");
  };
  try {
    current();
    const response = await apiFetch(`/api/community${path}`, {
      ...options,
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    });
    const payload: unknown = await response.json();
    current();
    const body = record(payload);
    if (!response.ok)
      throw new CommunityApiError(
        response.status,
        typeof body.code === "string" ? body.code : "COMMUNITY_UNAVAILABLE",
        Number(response.headers.get("Retry-After")) ||
          (typeof body.retryAfterSeconds === "number"
            ? body.retryAfterSeconds
            : undefined),
      );
    if (body.success !== true) throw new Error("无效的聊天室响应");
    return body.data;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
export async function joinCommunity(signal?: AbortSignal) {
  return parseCommunitySummary(
    await request(
      "/membership",
      {
        method: "POST",
        body: JSON.stringify({ consentVersion: "2026-10-05" }),
      },
      signal,
    ),
  );
}
export async function getCommunitySummary(signal?: AbortSignal) {
  return parseCommunitySummary(await request("/me", {}, signal));
}
export async function listCommunityMessages(
  query: { before?: string; after?: string; limit?: number },
  signal?: AbortSignal,
): Promise<CommunityMessagePage> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) params.set(key, String(value));
  const page = record(await request(`/messages?${params}`, {}, signal), [
    "messages",
    "hasMore",
    "nextCursor",
    "latestEventSeq",
  ]);
  if (!Array.isArray(page.messages) || page.messages.length > 100)
    throw new Error("无效的消息列表");
  return {
    messages: page.messages.map(parseCommunityMessage),
    hasMore: bool(page.hasMore),
    nextCursor: page.nextCursor === null ? null : sequence(page.nextCursor),
    latestEventSeq: sequence(page.latestEventSeq),
  };
}
export async function requestCommunityWsTicket(signal?: AbortSignal) {
  const ticket = record(
    await request(
      "/ws-tickets",
      { method: "POST", body: JSON.stringify({}) },
      signal,
    ),
    ["ticket", "expiresAt", "protocol"],
  );
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(text(ticket.ticket)) ||
    ticket.protocol !== "booksoul.community.v1"
  )
    throw new Error("无效的连接票据");
  return {
    ticket: text(ticket.ticket),
    expiresAt: date(ticket.expiresAt),
    protocol: "booksoul.community.v1",
  };
}
export async function removeCommunityMessage(id: string, signal?: AbortSignal) {
  return parseCommunityMessage(
    await request(
      `/messages/${encodeURIComponent(id)}`,
      { method: "DELETE" },
      signal,
    ),
  );
}
export async function markCommunityRead(seq: string, signal?: AbortSignal) {
  return parseCommunitySummary(
    await request(
      "/read",
      { method: "POST", body: JSON.stringify({ throughSeq: sequence(seq) }) },
      signal,
    ),
  );
}
export async function hideCommunityMessage(
  id: string,
  reason: string,
  signal?: AbortSignal,
) {
  return parseCommunityMessage(
    await request(
      `/moderation/messages/${encodeURIComponent(id)}/hide`,
      { method: "POST", body: JSON.stringify({ reason }) },
      signal,
    ),
  );
}
export async function muteCommunityMember(
  id: string,
  input: { clientActionId: string; minutes: 10 | 60; reason: string },
  signal?: AbortSignal,
) {
  const result = record(
    await request(
      `/moderation/members/${encodeURIComponent(id)}/mute`,
      { method: "POST", body: JSON.stringify(input) },
      signal,
    ),
    ["memberId", "mutedUntil"],
  );
  return {
    memberId: text(result.memberId),
    mutedUntil: date(result.mutedUntil),
  };
}

function parseMentions(value: unknown) {
  if (!Array.isArray(value) || value.length > 10)
    throw new Error("无效的提及列表");
  return value.map((item) => {
    const m = record(item, ["memberId", "name"]);
    return { memberId: text(m.memberId), name: text(m.name) };
  });
}
export async function markCommunityVisibleRead(
  messageIds: string[],
  signal?: AbortSignal,
) {
  return parseCommunitySummary(
    await request(
      "/visible-read",
      { method: "POST", body: JSON.stringify({ messageIds }) },
      signal,
    ),
  );
}
export async function getCommunityMessageContext(
  id: string,
  signal?: AbortSignal,
): Promise<CommunityMessageContext> {
  const p = record(
    await request(`/messages/${encodeURIComponent(id)}/context`, {}, signal),
    ["messages", "hasOlder", "hasNewer", "latestEventSeq"],
  );
  if (!Array.isArray(p.messages) || p.messages.length > 100)
    throw new Error("无效的消息上下文");
  return {
    messages: p.messages.map(parseCommunityMessage),
    hasOlder: bool(p.hasOlder),
    hasNewer: bool(p.hasNewer),
    latestEventSeq: sequence(p.latestEventSeq),
  };
}
export async function getCommunityUnreadTarget(
  mentionOnly: boolean,
  signal?: AbortSignal,
  after?: string,
) {
  const params = new URLSearchParams({
    kind: mentionOnly ? "mentions" : "all",
  });
  if (after) params.set("after", sequence(after));
  const result = await request(`/unread-target?${params}`, {}, signal);
  if (result === null) return null;
  const target = record(result, ["id", "seq"]);
  return { id: text(target.id), seq: sequence(target.seq) };
}
export async function searchCommunityMembers(
  query: string,
  signal?: AbortSignal,
): Promise<CommunityPublicMember[]> {
  const result = await request(
    `/members?q=${encodeURIComponent(query)}`,
    {},
    signal,
  );
  if (!Array.isArray(result) || result.length > 20)
    throw new Error("无效的成员列表");
  return result.map((item) => {
    const m = record(item, ["memberId", "name", "avatarRevision"]);
    return {
      memberId: text(m.memberId),
      name: text(m.name),
      avatarRevision:
        m.avatarRevision === null ? null : sequence(m.avatarRevision),
    };
  });
}
export async function getCommunityAvatar(
  memberId: string,
  signal: AbortSignal,
): Promise<Blob> {
  const identity = useAuthStore.getState();
  const response = await apiFetch(
    `/api/community/members/${encodeURIComponent(memberId)}/avatar`,
    {
      signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
    },
  );
  if (
    !response.ok ||
    response.headers.get("Content-Type")?.split(";")[0] !== "image/webp"
  )
    throw new Error("头像不可用");
  const blob = await response.blob();
  signal.throwIfAborted();
  if (
    useAuthStore.getState().authGeneration !== identity.authGeneration ||
    useAuthStore.getState().user?.id !== identity.user?.id ||
    blob.size > 5 * 1024 ** 2
  )
    throw new Error("头像不可用");
  return blob;
}
