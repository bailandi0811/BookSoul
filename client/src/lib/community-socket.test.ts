import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { openCommunitySocket } from "./community-socket";
vi.mock("./community-api", async () => {
  const actual =
    await vi.importActual<typeof import("./community-api")>("./community-api");
  return {
    ...actual,
    requestCommunityWsTicket: vi.fn(async () => ({
      ticket: "x".repeat(43),
      expiresAt: new Date(Date.now() + 30000).toISOString(),
      protocol: "booksoul.community.v1",
    })),
  };
});
class Socket extends EventTarget {
  static instances: Socket[] = [];
  readyState = 0;
  protocol = "booksoul.community.v1";
  sent: string[] = [];
  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {
    super();
    Socket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event("open"));
  }
  frame(event: string, data: unknown) {
    this.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify({ event, data }) }),
    );
  }
  close(code = 1000) {
    if (code !== 1000 && (code < 3000 || code > 4999))
      throw new DOMException("Invalid close code", "InvalidAccessError");
    this.readyState = 3;
    this.dispatchEvent(new CloseEvent("close", { code }));
  }
  serverClose(code: number) {
    this.readyState = 3;
    this.dispatchEvent(new CloseEvent("close", { code }));
  }
}
beforeEach(() => {
  Socket.instances = [];
  vi.stubGlobal("WebSocket", Socket);
});
afterEach(() => vi.unstubAllGlobals());
async function create() {
  const onFrame = vi.fn(),
    onClose = vi.fn();
  const controller = new AbortController();
  const pending = openCommunitySocket({
    after: "0",
    onFrame,
    onClose,
    signal: controller.signal,
  });
  await Promise.resolve();
  await Promise.resolve();
  const socket = Socket.instances[0];
  socket.open();
  socket.frame("connection.ready", { protocolVersion: 1 });
  return { socket, pending, onFrame, onClose, controller };
}
it("uses ticket subprotocol, waits for sync, and never puts credentials in URL", async () => {
  const { socket, pending } = await create();
  expect(socket.url).toMatch(/\/api\/community\/ws$/);
  expect(socket.url).not.toContain("xxxxx");
  expect(socket.protocols).toEqual([
    "booksoul.community.v1",
    `ticket.${"x".repeat(43)}`,
  ]);
  expect(JSON.parse(socket.sent[0])).toEqual({
    event: "connection.resume",
    data: { after: "0" },
  });
  socket.frame("sync.complete", { throughSeq: "0" });
  const connection = await pending;
  connection.close();
});
it("abort closes the pending connection and prevents late callbacks", async () => {
  const { socket, pending, controller, onFrame } = await create();
  controller.abort();
  await expect(pending).rejects.toThrow();
  const count = onFrame.mock.calls.length;
  socket.frame("presence", { onlineCount: 3 });
  expect(onFrame).toHaveBeenCalledTimes(count);
});
it("does not advance cursor for ack and rejects malformed server frames", async () => {
  const { socket, pending, onClose } = await create();
  socket.frame("sync.complete", { throughSeq: "0" });
  const connection = await pending;
  socket.frame("unknown", {});
  expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ code: 1008 }));
  connection.close();
});
it("notifies restart close without issuing an illegal browser close code", async () => {
  const { socket, pending, onClose } = await create();
  socket.frame("sync.complete", { throughSeq: "0" });
  await pending;
  socket.serverClose(1012);
  expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ code: 1012 }));
});
