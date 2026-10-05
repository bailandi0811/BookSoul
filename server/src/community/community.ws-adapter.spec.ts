import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { CommunityWsAdapter } from './community.ws-adapter';
import { CommunityTicketsService } from './community.tickets.service';
import type { CommunityService } from './community.service';
import type { PrismaService } from '../prisma/prisma.service';
import { COMMUNITY_PROTOCOL, COMMUNITY_PATH } from './community.policy';

describe('real HTTP upgrade with mock database', () => {
  let http: Server;
  let adapter: CommunityWsAdapter;
  let tickets: CommunityTicketsService;
  let url: string;
  const identity = {
    userId: 'fixture',
    authVersion: 1,
    expiresAt: Date.now() + 600_000,
  };
  beforeEach(async () => {
    tickets = new CommunityTicketsService(
      {
        user: { findUnique: async () => ({ authVersion: 1 }) },
      } as unknown as PrismaService,
      {
        roomId: 'readers-lobby',
        member: async () => ({ id: 'member' }),
      } as unknown as CommunityService,
    );
    tickets.setAllowedOrigins(new Set(['http://localhost:5173']));
    http = createServer();
    adapter = new CommunityWsAdapter(http, tickets);
    adapter.create(0, { path: COMMUNITY_PATH });
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    url = `ws://127.0.0.1:${(http.address() as AddressInfo).port}${COMMUNITY_PATH}`;
  });
  afterEach(async () => {
    await adapter.dispose();
    tickets.onModuleDestroy();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  async function connect(
    protocols: string[],
    origin = 'http://localhost:5173',
  ) {
    return new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(url, protocols, { origin });
      socket.once('open', () => resolve(socket));
      socket.once('error', reject);
    });
  }
  it('rejects_missing_reused_or_wrong_origin_before_101', async () => {
    await expect(connect([COMMUNITY_PROTOCOL])).rejects.toThrow('401');
    const issued = await tickets.issue(identity, 'http://localhost:5173');
    await expect(
      connect(
        [COMMUNITY_PROTOCOL, `ticket.${issued.ticket}`],
        'https://fixture.invalid',
      ),
    ).rejects.toThrow('403');
    const socket = await connect([
      COMMUNITY_PROTOCOL,
      `ticket.${issued.ticket}`,
    ]);
    expect(socket.protocol).toBe(COMMUNITY_PROTOCOL);
    socket.terminate();
    await expect(
      connect([COMMUNITY_PROTOCOL, `ticket.${issued.ticket}`]),
    ).rejects.toThrow('401');
  });
  it('reserves_and_releases_handshake_capacity', async () => {
    const sockets: WebSocket[] = [];
    for (let i = 0; i < 3; i++) {
      const issued = await tickets.issue(identity, 'http://localhost:5173');
      sockets.push(
        await connect([COMMUNITY_PROTOCOL, `ticket.${issued.ticket}`]),
      );
    }
    await expect(
      tickets.issue(identity, 'http://localhost:5173'),
    ).rejects.toMatchObject({ status: 429 });
    for (const socket of sockets) socket.terminate();
  });
  it('bounds_message_payload_and_rejects_malformed_frames', async () => {
    const server = adapter.getCommunityServer();
    server.on('connection', (socket) =>
      adapter.bindMessageHandlers(socket, [], () => {
        throw new Error('should not dispatch');
      }),
    );
    const issued = await tickets.issue(identity, 'http://localhost:5173');
    const socket = await connect([
      COMMUNITY_PROTOCOL,
      `ticket.${issued.ticket}`,
    ]);
    const closed = new Promise<number>((resolve) =>
      socket.once('close', (code) => resolve(code)),
    );
    socket.send('{broken');
    expect(await closed).toBe(1008);
    const large = await tickets.issue(identity, 'http://localhost:5173');
    const second = await connect([
      COMMUNITY_PROTOCOL,
      `ticket.${large.ticket}`,
    ]);
    const closedLarge = new Promise<number>((resolve) =>
      second.once('close', (code) => resolve(code)),
    );
    second.send('x'.repeat(17 * 1024));
    expect(await closedLarge).toBe(1009);
  });
});
