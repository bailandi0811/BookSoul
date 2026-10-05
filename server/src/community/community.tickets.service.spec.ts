import { CommunityTicketsService } from './community.tickets.service';
import type { CommunityService } from './community.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('one-use websocket credentials', () => {
  const identity = {
    userId: 'fixture-user',
    memberId: 'fixture-member',
    roomId: 'readers-lobby',
    authVersion: 2,
    expiresAt: Date.now() + 60_000,
  };
  function setup() {
    const community = {
      roomId: identity.roomId,
      member: jest.fn().mockResolvedValue({ id: identity.memberId }),
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ authVersion: 2 }) },
    };
    const tickets = new CommunityTicketsService(
      prisma as unknown as PrismaService,
      community as unknown as CommunityService,
    );
    tickets.setAllowedOrigins(new Set(['http://localhost:5173']));
    return { tickets, community, prisma };
  }
  it('requires_membership_before_ticket', async () => {
    const { tickets, community } = setup();
    community.member.mockRejectedValue(new Error('join required'));
    await expect(
      tickets.issue(
        {
          userId: identity.userId,
          authVersion: 2,
          expiresAt: identity.expiresAt,
        },
        'http://localhost:5173',
      ),
    ).rejects.toThrow('join required');
  });
  it('consumes_ticket_only_once_under_concurrent_upgrade', async () => {
    const { tickets } = setup();
    const issued = await tickets.issue(identity, 'http://localhost:5173');
    const results = await Promise.allSettled([
      tickets.consume(issued.ticket, 'http://localhost:5173'),
      tickets.consume(issued.ticket, 'http://localhost:5173'),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    tickets.onModuleDestroy();
  });
  it('rejects_expired_ticket_or_wrong_origin', async () => {
    const { tickets } = setup();
    const issued = await tickets.issue(identity, 'http://localhost:5173');
    await expect(
      tickets.consume(issued.ticket, 'https://fixture.invalid'),
    ).rejects.toMatchObject({ status: 403 });
    jest.spyOn(Date, 'now').mockReturnValue(identity.expiresAt + 1);
    await expect(
      tickets.consume(issued.ticket, 'http://localhost:5173'),
    ).rejects.toMatchObject({ status: 401 });
    jest.restoreAllMocks();
    tickets.onModuleDestroy();
  });
  it('revoked_identity_cannot_send_or_upgrade', async () => {
    const { tickets, prisma } = setup();
    const issued = await tickets.issue(identity, 'http://localhost:5173');
    prisma.user.findUnique.mockResolvedValue({ authVersion: 3 });
    await expect(
      tickets.consume(issued.ticket, 'http://localhost:5173'),
    ).rejects.toMatchObject({ status: 403 });
    await expect(tickets.validateIdentity(identity)).rejects.toMatchObject({
      status: 403,
    });
    tickets.onModuleDestroy();
  });
  it('bounds_unused_credentials_and_rejects_missing_origin', async () => {
    const { tickets } = setup();
    await expect(tickets.issue(identity, undefined)).rejects.toMatchObject({
      status: 403,
    });
    await tickets.issue(identity, 'http://localhost:5173');
    await tickets.issue(identity, 'http://localhost:5173');
    await expect(
      tickets.issue(identity, 'http://localhost:5173'),
    ).rejects.toMatchObject({ status: 429 });
    tickets.onModuleDestroy();
  });
});
