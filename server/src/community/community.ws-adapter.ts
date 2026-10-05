import { Logger } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import type { MessageMappingProperties } from '@nestjs/websockets/gateway-metadata-explorer';
import { lastValueFrom, type Observable } from 'rxjs';
import { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import WebSocket, { WebSocketServer, type RawData } from 'ws';
import { CommunityTicketsService } from './community.tickets.service';
import {
  COMMUNITY_PATH,
  COMMUNITY_PROTOCOL,
  communityError,
  errorFrameData,
  POLICY,
} from './community.policy';
import { parseClientFrame } from './dto/community.dto';
import { socketConnections, socketIdentities } from './community.connection';

export class CommunityWsAdapter extends WsAdapter {
  private readonly safeLogger = new Logger('CommunityWebSocket');
  private detach?: () => void;
  private server?: WebSocketServer;
  constructor(
    httpServer: Server,
    private readonly tickets: CommunityTicketsService,
  ) {
    super(httpServer);
  }
  override create(
    port: number,
    options?: Record<string, unknown>,
  ): WebSocketServer {
    if (port !== 0 || options?.path !== COMMUNITY_PATH)
      throw new Error('Community WS must use the existing HTTP port and path');
    this.server = super.create(port, {
      ...options,
      maxPayload: POLICY.maxPayload,
      perMessageDeflate: false,
      closeTimeout: POLICY.closeTimeoutMs,
      handleProtocols: (protocols: Set<string>) =>
        protocols.has(COMMUNITY_PROTOCOL) ? COMMUNITY_PROTOCOL : false,
    }) as WebSocketServer;
    return this.server;
  }
  getCommunityServer() {
    if (!this.server) throw new Error('Community server not initialized');
    return this.server;
  }
  protected override ensureHttpServerExists(
    port: number,
    httpServer?: Server,
  ): Server | undefined {
    if (!httpServer || port !== 0)
      throw new Error('Community HTTP server required');
    if (this.httpServersRegistry.has(port)) return;
    this.httpServersRegistry.set(port, httpServer);
    const listener = (
      request: IncomingMessage,
      socket: Duplex,
      head: Buffer,
    ) => {
      void this.upgrade(request, socket, head);
    };
    httpServer.on('upgrade', listener);
    this.detach = () => httpServer.off('upgrade', listener);
    return httpServer;
  }
  private async upgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) {
    let release: (() => void) | undefined;
    let handedOff = false;
    let timedOut = false;
    const onError = () => {};
    socket.on('error', onError);
    const deadline = setTimeout(() => {
      timedOut = true;
      release?.();
      socket.destroy();
    }, POLICY.handshakeMs);
    deadline.unref();
    try {
      const url = new URL(request.url ?? '', 'http://community.local');
      if (url.pathname !== COMMUNITY_PATH || url.search)
        throw communityError(400, 'COMMUNITY_INVALID_UPGRADE');
      this.tickets.assertOrigin(request.headers.origin);
      const protocols =
        request.headers['sec-websocket-protocol']
          ?.split(',')
          .map((value) => value.trim()) ?? [];
      const ticketProtocols = protocols.filter((value) =>
        value.startsWith('ticket.'),
      );
      if (
        protocols.length !== 2 ||
        !protocols.includes(COMMUNITY_PROTOCOL) ||
        ticketProtocols.length !== 1
      )
        throw communityError(401, 'COMMUNITY_TICKET_INVALID');
      const identity = await this.tickets.consume(
        ticketProtocols[0].slice(7),
        request.headers.origin,
        (claimed) => {
          release = this.tickets.reserve(claimed);
        },
      );
      if (timedOut || socket.destroyed) return;
      const server = this.getCommunityServer();
      server.handleUpgrade(request, socket, head, (client) => {
        handedOff = true;
        socketIdentities.set(client, identity);
        client.once('close', () => release?.());
        server.emit('connection', client, request);
      });
    } catch (error) {
      if (!socket.destroyed && !timedOut) {
        const data = errorFrameData(error);
        const status = [400, 401, 403, 429].includes(data.status)
          ? data.status
          : 503;
        socket.end(
          `HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nCache-Control: no-store\r\n${status === 429 ? 'Retry-After: 5\r\n' : ''}Content-Length: 0\r\n\r\n`,
        );
      }
    } finally {
      clearTimeout(deadline);
      socket.off('error', onError);
      if (!handedOff) release?.();
    }
  }
  override bindErrorHandler(server: WebSocketServer): WebSocketServer {
    server.on('error', () => this.safeLogger.warn('COMMUNITY_SERVER_ERROR'));
    server.on('connection', (socket: WebSocket) =>
      socket.on('error', () => this.safeLogger.warn('COMMUNITY_SOCKET_ERROR')),
    );
    return server;
  }
  override bindMessageHandlers(
    client: WebSocket,
    handlers: MessageMappingProperties[],
    transform: (value: unknown) => Observable<unknown>,
  ) {
    const map = new Map(handlers.map((handler) => [handler.message, handler]));
    let window = Date.now();
    let count = 0;
    let pending = 0;
    let chain = Promise.resolve();
    const fail = (error: unknown) => {
      const conn = socketConnections.get(client);
      conn?.error(error);
      if (errorFrameData(error).code === 'COMMUNITY_INVALID_CONTENT') return;
      if (conn) conn.close(1008, 'INVALID_FRAME');
      else client.close(1008, 'INVALID_FRAME');
    };
    const receive = (raw: RawData, isBinary: boolean) => {
      if (client.readyState !== WebSocket.OPEN) return;
      if (Date.now() - window >= POLICY.incomingWindowMs) {
        window = Date.now();
        count = 0;
      }
      if (++count > POLICY.incomingFrames || pending >= POLICY.incomingQueue) {
        fail(communityError(400, 'COMMUNITY_FRAME_LIMIT'));
        return;
      }
      pending++;
      chain = chain
        .then(async () => {
          if (client.readyState !== WebSocket.OPEN) return;
          if (isBinary) throw communityError(400, 'COMMUNITY_INVALID_FRAME');
          let value: unknown;
          try {
            value = JSON.parse(raw.toString());
          } catch {
            throw communityError(400, 'COMMUNITY_INVALID_FRAME');
          }
          const frame = parseClientFrame(value);
          const handler = map.get(frame.event);
          if (!handler) throw communityError(400, 'COMMUNITY_INVALID_FRAME');
          await lastValueFrom(
            transform(handler.callback(frame.data, frame.event)),
            { defaultValue: undefined },
          );
        })
        .catch(fail)
        .finally(() => {
          pending--;
        });
    };
    client.on('message', receive);
    client.once('close', () => client.off('message', receive));
  }
  override async dispose() {
    this.detach?.();
    if (this.server) await super.close(this.server);
    await super.dispose();
  }
}
