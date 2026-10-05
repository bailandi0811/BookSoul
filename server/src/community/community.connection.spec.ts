import { EventEmitter } from 'node:events';
import type WebSocket from 'ws';
import { CommunityConnection } from './community.connection';
import { POLICY } from './community.policy';

class FakeSocket extends EventEmitter {
  readyState = 1;
  bufferedAmount = 0;
  send = jest.fn((_data: string, callback: (error?: Error) => void) =>
    callback(),
  );
  ping = jest.fn();
  close = jest.fn();
  terminate = jest.fn();
}
describe('bounded websocket connection', () => {
  const identity = {
    userId: 'user',
    memberId: 'member',
    roomId: 'readers-lobby',
    authVersion: 0,
    expiresAt: Date.now() + 120_000,
  };
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  it('healthy_connection_does_not_rotate_at_60_seconds', async () => {
    const socket = new FakeSocket();
    socket.ping.mockImplementation(() => socket.emit('pong'));
    const conn = new CommunityConnection(
      socket as unknown as WebSocket,
      identity,
      async () => {},
      () => {},
    );
    await jest.advanceTimersByTimeAsync(60_000);
    expect(socket.close).not.toHaveBeenCalled();
    conn.close(1000, 'NORMAL');
  });
  it('releases_slow_or_closed_socket', () => {
    const socket = new FakeSocket();
    const done = jest.fn();
    socket.bufferedAmount = POLICY.bufferedBytes + 1;
    const conn = new CommunityConnection(
      socket as unknown as WebSocket,
      identity,
      async () => {},
      done,
    );
    conn.enqueue({ event: 'presence', data: { onlineCount: 1 } });
    expect(socket.close).toHaveBeenCalledWith(4010, 'SLOW_CONSUMER');
    expect(done).toHaveBeenCalledTimes(1);
    conn.close(4010, 'SLOW_CONSUMER');
    expect(done).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(POLICY.closeTimeoutMs);
    expect(socket.terminate).toHaveBeenCalledTimes(1);
  });
  it('terminates_when_pong_or_write_ack_missing', async () => {
    const socket = new FakeSocket();
    const conn = new CommunityConnection(
      socket as unknown as WebSocket,
      identity,
      async () => {},
      () => {},
    );
    await jest.advanceTimersByTimeAsync(POLICY.heartbeatMs + POLICY.pongMs);
    expect(socket.close).toHaveBeenCalled();
    conn.close(1000, 'NORMAL');
  });
});
