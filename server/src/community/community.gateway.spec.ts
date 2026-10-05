import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { CommunityGateway } from './community.gateway';
import type { CommunityService } from './community.service';
import type { CommunityEventsService } from './community.events.service';
import type { CommunityTicketsService } from './community.tickets.service';
import { socketIdentities } from './community.connection';

class Socket extends EventEmitter {
  readyState = 1;
  bufferedAmount = 0;
  frames: unknown[] = [];
  send(data: string, done: (error?: Error) => void) {
    this.frames.push(JSON.parse(data));
    done();
  }
  ping() {}
  close = jest.fn();
  terminate = jest.fn();
}
describe('gateway ordering and committed acknowledgements', () => {
  const identity = {
    userId: 'user-a',
    memberId: 'member-a',
    roomId: 'readers-lobby',
    authVersion: 1,
    expiresAt: Date.now() + 600_000,
  };
  const message = {
    id: 'message',
    seq: '1',
    clientMessageId: 'client',
    author: { memberId: 'member-a', name: 'Reader' },
    content: 'hello',
    status: 'ACTIVE',
    createdAt: new Date(0).toISOString(),
    replyTo: null,
  };
  function setup() {
    let listener: ((event: unknown) => void) | undefined;
    const events = {
      listen: jest.fn((callback) => {
        listener = callback;
        return jest.fn();
      }),
      backfill: jest.fn(async () => ({ events: [], throughSeq: '0' })),
      sweep: jest.fn(async () => {}),
    };
    const service = { send: jest.fn(async () => message) };
    const tickets = { validateIdentity: jest.fn(async () => {}) };
    const gateway = new CommunityGateway(
      service as unknown as CommunityService,
      events as unknown as CommunityEventsService,
      tickets as unknown as CommunityTicketsService,
    );
    const socket = new Socket();
    socketIdentities.set(socket as unknown as WebSocket, identity);
    gateway.handleConnection(socket as unknown as WebSocket);
    return {
      gateway,
      socket,
      events,
      service,
      tickets,
      emit: (frame: unknown) => listener?.(frame),
    };
  }
  it('rejects_send_before_sync_or_duplicate_resume', async () => {
    const { gateway, socket, service } = setup();
    await gateway.send(socket as unknown as WebSocket, {
      clientMessageId: 'client',
      content: 'hello',
    });
    expect(service.send).not.toHaveBeenCalled();
    expect(socket.frames).toContainEqual(
      expect.objectContaining({ event: 'error' }),
    );
    gateway.onModuleDestroy();
  });
  it('does_not_lose_event_between_snapshot_and_resume', async () => {
    const { gateway, socket, events, emit } = setup();
    events.backfill.mockImplementation(async () => {
      emit({ event: 'message.created', data: { seq: '1', message } });
      return { events: [], throughSeq: '0' };
    });
    await gateway.resume(socket as unknown as WebSocket, { after: '0' });
    expect(
      socket.frames.filter(
        (frame) => (frame as { event: string }).event === 'message.created',
      ),
    ).toHaveLength(1);
    const created = socket.frames.findIndex(
      (frame) => (frame as { event: string }).event === 'message.created',
    );
    const synced = socket.frames.findIndex(
      (frame) => (frame as { event: string }).event === 'sync.complete',
    );
    expect(created).toBeLessThan(synced);
    gateway.onModuleDestroy();
  });
  it('ack_is_sent_only_after_commit', async () => {
    const { gateway, socket, service } = setup();
    await gateway.resume(socket as unknown as WebSocket, { after: '0' });
    let commit: ((value: typeof message) => void) | undefined;
    service.send.mockImplementation(
      () =>
        new Promise((resolve) => {
          commit = resolve;
        }),
    );
    const send = gateway.send(socket as unknown as WebSocket, {
      clientMessageId: 'client',
      content: 'hello',
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(
      socket.frames.some(
        (frame) => (frame as { event: string }).event === 'message.ack',
      ),
    ).toBe(false);
    commit?.(message);
    await send;
    expect(socket.frames).toContainEqual({
      event: 'message.ack',
      data: { clientMessageId: 'client', message },
    });
    gateway.onModuleDestroy();
  });
});
