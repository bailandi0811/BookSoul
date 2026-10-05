import {
  count,
  parseCommunityMessage,
  record,
  requestCommunityWsTicket,
  sequence,
  text,
} from "./community-api";
import type { CommunityFrame, CommunitySend } from "./community-types";
export interface CommunitySocket {
  sendMessage(input: CommunitySend): void;
  close(): void;
}
export interface CommunityClose {
  code: number;
  reason?: string;
}
export function parseCommunityFrame(value: unknown): CommunityFrame {
  const frame = record(value, ["event", "data"]);
  const event = text(frame.event);
  const d = record(frame.data);
  switch (event) {
    case "message.created":
    case "message.removed":
      record(d, ["seq", "message"]);
      return {
        event,
        data: {
          seq: sequence(d.seq),
          message: parseCommunityMessage(d.message),
        },
      };
    case "cursor":
      record(d, ["seq"]);
      return { event, data: { seq: sequence(d.seq) } };
    case "message.ack":
      record(d, ["clientMessageId", "message"]);
      return {
        event,
        data: {
          clientMessageId: text(d.clientMessageId),
          message: parseCommunityMessage(d.message),
        },
      };
    case "connection.ready":
      record(d, ["protocolVersion"]);
      if (d.protocolVersion !== 1) break;
      return { event, data: { protocolVersion: 1 } };
    case "sync.complete":
      record(d, ["throughSeq"]);
      return { event, data: { throughSeq: sequence(d.throughSeq) } };
    case "presence":
      record(d, ["onlineCount"]);
      return { event, data: { onlineCount: count(d.onlineCount) } };
    case "heartbeat":
    case "auth.expired":
      record(d, []);
      return { event, data: {} };
    case "reset":
      record(d, ["reason"]);
      if (d.reason !== "CURSOR_TOO_OLD" && d.reason !== "SLOW_CONSUMER") break;
      return { event, data: { reason: d.reason } };
    case "error":
      record(d, ["code", "status", "clientMessageId", "retryAfterSeconds"]);
      return {
        event,
        data: {
          code: text(d.code),
          status: count(d.status),
          ...(d.clientMessageId === undefined
            ? {}
            : { clientMessageId: text(d.clientMessageId) }),
          ...(d.retryAfterSeconds === undefined
            ? {}
            : { retryAfterSeconds: count(d.retryAfterSeconds) }),
        },
      };
  }
  throw new Error("无效的聊天室事件");
}
export async function openCommunitySocket(options: {
  after: string;
  onFrame: (frame: CommunityFrame) => void;
  onClose: (close: CommunityClose) => void;
  signal: AbortSignal;
}): Promise<CommunitySocket> {
  const ticket = await requestCommunityWsTicket(options.signal);
  options.signal.throwIfAborted();
  const url = new URL("/api/community/ws", window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(url.href, [
    "booksoul.community.v1",
    `ticket.${ticket.ticket}`,
  ]);
  return new Promise((resolve, reject) => {
    let finished = false,
      synced = false,
      ready = false,
      cursor = BigInt(sequence(options.after));
    let deadline: ReturnType<typeof setTimeout>;
    let idle: ReturnType<typeof setTimeout>;
    const clean = () => {
      clearTimeout(deadline);
      clearTimeout(idle);
      options.signal.removeEventListener("abort", abort);
      socket.removeEventListener("open", open);
      socket.removeEventListener("message", message);
      socket.removeEventListener("close", closed);
      socket.removeEventListener("error", error);
    };
    const finish = (code: number, reason: string, notify = true) => {
      if (finished) return;
      finished = true;
      clean();
      if (!synced) reject(new Error(reason));
      // Browser close() only accepts 1000 or application codes; retain the peer's
      // actual code for recovery even when the local socket is already closed.
      if (socket.readyState < 2)
        socket.close(code >= 3000 && code <= 4999 ? code : 1000);
      if (notify) options.onClose({ code, reason });
    };
    const abort = () => finish(1000, "连接已取消", false);
    const open = () => {
      if (socket.protocol !== "booksoul.community.v1")
        finish(1008, "连接协议不匹配");
    };
    const closed = (event: CloseEvent) =>
      finish(event.code, event.reason || "连接已断开");
    const error = () => finish(1006, "网络连接失败");
    const watch = () => {
      clearTimeout(idle);
      idle = setTimeout(() => finish(1006, "连接超时"), 45000);
    };
    const message = (event: MessageEvent) => {
      if (finished) return;
      try {
        if (typeof event.data !== "string" || event.data.length > 32768)
          throw new Error("无效事件");
        const frame = parseCommunityFrame(JSON.parse(event.data) as unknown);
        watch();
        if (frame.event === "connection.ready") {
          if (ready) throw new Error("重复 ready");
          ready = true;
          clearTimeout(deadline);
          deadline = setTimeout(() => finish(1006, "同步超时"), 10000);
          socket.send(
            JSON.stringify({
              event: "connection.resume",
              data: { after: options.after },
            }),
          );
        }
        if ("seq" in frame.data) {
          const seq = BigInt(frame.data.seq);
          if (seq <= cursor) return;
          if (seq !== cursor + 1n) throw new Error("事件序列不连续");
          options.onFrame(frame);
          cursor = seq;
        } else {
          if (frame.event === "sync.complete") {
            if (!ready || synced || BigInt(frame.data.throughSeq) !== cursor)
              throw new Error("无效同步水位");
            options.onFrame(frame);
            synced = true;
            clearTimeout(deadline);
            resolve({
              sendMessage(input) {
                if (finished || !synced || socket.readyState !== 1)
                  throw new Error("聊天室尚未连接");
                socket.send(
                  JSON.stringify({ event: "message.send", data: input }),
                );
              },
              close: abort,
            });
          } else options.onFrame(frame);
        }
      } catch {
        finish(1008, "聊天室协议错误");
      }
    };
    socket.addEventListener("open", open);
    socket.addEventListener("message", message);
    socket.addEventListener("close", closed);
    socket.addEventListener("error", error);
    options.signal.addEventListener("abort", abort, { once: true });
    deadline = setTimeout(() => finish(1006, "握手超时"), 10000);
    watch();
    if (options.signal.aborted) abort();
  });
}
