import WebSocket from 'ws';
import { errorFrameData, POLICY } from './community.policy';
import type {
  CommunityServerFrame,
  CommunityWsIdentity,
} from './community.types';

export const socketIdentities = new WeakMap<WebSocket, CommunityWsIdentity>();
export const socketConnections = new WeakMap<WebSocket, CommunityConnection>();
interface Write {
  frame: CommunityServerFrame;
  done?: (error?: Error) => void;
}
export class CommunityConnection {
  readonly abort = new AbortController();
  ready = false;
  resuming = false;
  cursor = 0n;
  closed = false;
  private queue: Write[] = [];
  private writing = false;
  private heartbeat: ReturnType<typeof setInterval>;
  private expiry?: ReturnType<typeof setTimeout>;
  private pong?: ReturnType<typeof setTimeout>;
  private sendDeadline?: ReturnType<typeof setTimeout>;
  private terminateDeadline?: ReturnType<typeof setTimeout>;
  private checking = false;
  private inflight?: Write;
  private readonly receivedPong = () => {
    if (this.pong) clearTimeout(this.pong);
    this.pong = undefined;
  };
  constructor(
    readonly socket: WebSocket,
    readonly identity: CommunityWsIdentity,
    private readonly revalidate: () => Promise<void>,
    private readonly onClose: () => void,
  ) {
    socket.on('pong', this.receivedPong);
    socket.once('close', () => this.close(1000, 'CLOSED'));
    this.heartbeat = setInterval(() => void this.tick(), POLICY.heartbeatMs);
    this.heartbeat.unref();
    this.armExpiry();
  }
  private armExpiry() {
    const remaining = this.identity.expiresAt - Date.now();
    this.expiry = setTimeout(
      () => {
        if (this.identity.expiresAt > Date.now()) {
          this.armExpiry();
          return;
        }
        this.enqueue({ event: 'auth.expired', data: {} });
        this.close(4001, 'AUTH_EXPIRED');
      },
      Math.max(0, Math.min(remaining, 2_147_483_647)),
    );
    this.expiry.unref();
  }
  private async tick() {
    if (this.closed || this.checking) return;
    this.checking = true;
    try {
      await this.revalidate();
      if (this.closed) return;
      this.enqueue({ event: 'heartbeat', data: {} });
      this.pong = setTimeout(
        () => this.close(4000, 'HEARTBEAT_TIMEOUT'),
        POLICY.pongMs,
      );
      this.pong.unref();
      this.socket.ping();
    } catch (error) {
      const status = errorFrameData(error).status;
      this.close(
        status === 401 ? 4001 : status === 403 ? 4003 : 1012,
        status === 401
          ? 'AUTH_EXPIRED'
          : status === 403
            ? 'AUTH_REVOKED'
            : 'UNAVAILABLE',
      );
    } finally {
      this.checking = false;
    }
  }
  enqueue(frame: CommunityServerFrame) {
    this.put({ frame });
  }
  write(frame: CommunityServerFrame): Promise<void> {
    return new Promise((resolve, reject) =>
      this.put({ frame, done: (error) => (error ? reject(error) : resolve()) }),
    );
  }
  private put(item: Write) {
    if (this.closed) {
      item.done?.(new Error('CONNECTION_CLOSED'));
      return;
    }
    if (
      this.queue.length >= POLICY.outgoingQueue ||
      this.socket.bufferedAmount > POLICY.bufferedBytes
    ) {
      item.done?.(new Error('SLOW_CONSUMER'));
      this.close(4010, 'SLOW_CONSUMER');
      return;
    }
    this.queue.push(item);
    this.flush();
  }
  private flush() {
    if (this.writing || this.closed) return;
    const item = this.queue.shift();
    if (!item) return;
    if (
      this.socket.readyState !== WebSocket.OPEN ||
      this.socket.bufferedAmount > POLICY.bufferedBytes
    ) {
      item.done?.(new Error('SLOW_CONSUMER'));
      this.close(4010, 'SLOW_CONSUMER');
      return;
    }
    this.writing = true;
    this.inflight = item;
    this.sendDeadline = setTimeout(
      () => this.close(4010, 'SLOW_CONSUMER'),
      POLICY.sendTimeoutMs,
    );
    this.sendDeadline.unref();
    try {
      this.socket.send(JSON.stringify(item.frame), (error) => {
        if (this.inflight !== item) return;
        clearTimeout(this.sendDeadline);
        this.sendDeadline = undefined;
        this.inflight = undefined;
        this.writing = false;
        item.done?.(error);
        if (error) {
          this.close(1012, 'WRITE_FAILED');
          return;
        }
        this.flush();
      });
    } catch {
      item.done?.(new Error('WRITE_FAILED'));
      this.close(1012, 'WRITE_FAILED');
    }
  }
  error(error: unknown, clientMessageId?: string) {
    this.enqueue({
      event: 'error',
      data: {
        ...errorFrameData(error),
        ...(clientMessageId ? { clientMessageId } : {}),
      },
    });
  }
  reset(reason: 'CURSOR_TOO_OLD' | 'SLOW_CONSUMER') {
    this.enqueue({ event: 'reset', data: { reason } });
    this.close(reason === 'CURSOR_TOO_OLD' ? 4009 : 4010, reason);
  }
  close(code: number, reason: string) {
    if (this.closed) {
      if (this.socket.readyState === WebSocket.CLOSED && this.terminateDeadline)
        clearTimeout(this.terminateDeadline);
      return;
    }
    this.closed = true;
    this.abort.abort();
    clearInterval(this.heartbeat);
    clearTimeout(this.expiry);
    clearTimeout(this.pong);
    clearTimeout(this.sendDeadline);
    this.socket.off('pong', this.receivedPong);
    this.inflight?.done?.(new Error('CONNECTION_CLOSED'));
    this.inflight = undefined;
    for (const item of this.queue) item.done?.(new Error('CONNECTION_CLOSED'));
    this.queue = [];
    this.onClose();
    if (
      this.socket.readyState === WebSocket.OPEN ||
      this.socket.readyState === WebSocket.CONNECTING
    ) {
      this.socket.close(code, reason);
      this.terminateDeadline = setTimeout(
        () => this.socket.terminate(),
        POLICY.closeTimeoutMs,
      );
      this.terminateDeadline.unref();
    }
  }
}
