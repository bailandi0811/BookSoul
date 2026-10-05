import { OnModuleDestroy } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import WebSocket from 'ws';
import { CommunityService } from './community.service';
import { CommunityEventsService } from './community.events.service';
import { CommunityTicketsService } from './community.tickets.service';
import {
  CommunityConnection,
  socketConnections,
  socketIdentities,
} from './community.connection';
import {
  COMMUNITY_PATH,
  communityError,
  errorFrameData,
  parseSequence,
  POLICY,
} from './community.policy';
import type { CommunityEventDTO, SendMessageInput } from './community.types';

@SkipThrottle()
@WebSocketGateway({ path: COMMUNITY_PATH })
export class CommunityGateway implements OnModuleDestroy {
  private connections = new Map<WebSocket, CommunityConnection>();
  constructor(
    private readonly community: CommunityService,
    private readonly events: CommunityEventsService,
    private readonly tickets: CommunityTicketsService,
  ) {}
  handleConnection(socket: WebSocket) {
    const identity = socketIdentities.get(socket);
    if (!identity) {
      socket.close(4003, 'AUTH_REQUIRED');
      return;
    }
    const connection = new CommunityConnection(
      socket,
      identity,
      () => this.tickets.validateIdentity(identity),
      () => {
        this.connections.delete(socket);
        socketConnections.delete(socket);
        this.presence();
      },
    );
    this.connections.set(socket, connection);
    socketConnections.set(socket, connection);
    const syncDeadline = setTimeout(
      () => connection.close(1008, 'SYNC_TIMEOUT'),
      POLICY.syncMs,
    );
    syncDeadline.unref();
    connection.abort.signal.addEventListener(
      'abort',
      () => clearTimeout(syncDeadline),
      { once: true },
    );
    // The deadline applies to the initial resume, not to healthy long-lived sockets.
    const originalReadyCheck = setInterval(() => {
      if (connection.ready) {
        clearTimeout(syncDeadline);
        clearInterval(originalReadyCheck);
      }
    }, 100);
    originalReadyCheck.unref();
    connection.abort.signal.addEventListener(
      'abort',
      () => clearInterval(originalReadyCheck),
      { once: true },
    );
    connection.enqueue({
      event: 'connection.ready',
      data: { protocolVersion: 1 },
    });
    this.presence();
  }
  handleDisconnect(socket: WebSocket) {
    this.connections.get(socket)?.close(1000, 'CLOSED');
  }
  private presence() {
    const onlineCount = new Set(
      [...this.connections.values()]
        .filter((connection) => !connection.closed)
        .map((connection) => connection.identity.memberId),
    ).size;
    for (const connection of this.connections.values())
      connection.enqueue({ event: 'presence', data: { onlineCount } });
  }
  @SubscribeMessage('connection.resume')
  async resume(
    @ConnectedSocket() socket: WebSocket,
    @MessageBody() data: { after: string },
  ) {
    const connection = this.connections.get(socket);
    if (!connection || connection.closed) return;
    if (connection.resuming || connection.ready) {
      connection.error(communityError(400, 'COMMUNITY_INVALID_RESUME'));
      connection.close(1008, 'INVALID_RESUME');
      return;
    }
    connection.resuming = true;
    const buffer: CommunityEventDTO[] = [];
    let unsubscribe: () => void = () => {};
    try {
      connection.cursor = parseSequence(data.after);
      unsubscribe = this.events.listen((event) => {
        if (connection.closed) return;
        const seq = parseSequence(event.data.seq);
        if (seq <= connection.cursor) return;
        if (!connection.ready) {
          if (buffer.length >= POLICY.outgoingQueue) {
            connection.reset('SLOW_CONSUMER');
            return;
          }
          buffer.push(event);
          return;
        }
        connection.cursor = seq;
        connection.enqueue(event);
      });
      connection.abort.signal.addEventListener('abort', unsubscribe, {
        once: true,
      });
      const replay = await this.events.backfill(data.after);
      if (connection.closed) return;
      for (const event of replay.events) {
        await connection.write(event);
        connection.cursor = parseSequence(event.data.seq);
      }
      buffer.sort((a, b) =>
        parseSequence(a.data.seq) < parseSequence(b.data.seq) ? -1 : 1,
      );
      while (buffer.length) {
        const event = buffer.shift()!;
        const seq = parseSequence(event.data.seq);
        if (seq <= connection.cursor) continue;
        await connection.write(event);
        connection.cursor = seq;
      }
      const synced = connection.write({
        event: 'sync.complete',
        data: { throughSeq: connection.cursor.toString() },
      });
      connection.ready = true;
      await synced;
    } catch (error) {
      unsubscribe();
      if (connection.closed) return;
      if (errorFrameData(error).code === 'COMMUNITY_CURSOR_TOO_OLD') {
        connection.reset('CURSOR_TOO_OLD');
        return;
      }
      connection.error(error);
      connection.close(
        errorFrameData(error).status === 400 ? 1008 : 1012,
        'SYNC_FAILED',
      );
    }
  }
  @SubscribeMessage('message.send')
  async send(
    @ConnectedSocket() socket: WebSocket,
    @MessageBody() input: SendMessageInput,
  ) {
    const connection = this.connections.get(socket);
    if (!connection || connection.closed) return;
    try {
      if (!connection.ready) throw communityError(400, 'COMMUNITY_NOT_READY');
      await this.tickets.validateIdentity(connection.identity);
      if (connection.closed) return;
      const message = await this.community.send(
        connection.identity.userId,
        input,
      );
      connection.enqueue({
        event: 'message.ack',
        data: { clientMessageId: input.clientMessageId, message },
      });
      void this.events.sweep().catch(() => {}); // Durable sweep timer also retries failed notifications.
    } catch (error) {
      connection.error(error, input.clientMessageId);
      const code = errorFrameData(error).code;
      if (code === 'COMMUNITY_AUTH_EXPIRED')
        connection.close(4001, 'AUTH_EXPIRED');
      else if (
        code === 'COMMUNITY_AUTH_REVOKED' ||
        code === 'COMMUNITY_JOIN_REQUIRED'
      )
        connection.close(4003, 'AUTH_REVOKED');
    }
  }
  onModuleDestroy() {
    for (const connection of [...this.connections.values()])
      connection.close(1012, 'SERVER_STOPPING');
  }
}
