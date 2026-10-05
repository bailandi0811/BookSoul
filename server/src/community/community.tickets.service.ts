import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CommunityService } from './community.service';
import { communityError, COMMUNITY_PROTOCOL, POLICY } from './community.policy';
import type { CommunityWsIdentity } from './community.types';

interface Ticket {
  identity: CommunityWsIdentity;
  origin: string;
  expiresAt: number;
}
@Injectable()
export class CommunityTicketsService implements OnModuleInit, OnModuleDestroy {
  private readonly tickets = new Map<string, Ticket>();
  private origins = new Set<string>();
  private timer?: ReturnType<typeof setInterval>;
  private readonly connections = new Map<string, number>();
  private connectionCount = 0;
  constructor(
    private readonly prisma: PrismaService,
    private readonly community: CommunityService,
  ) {}
  setAllowedOrigins(origins: ReadonlySet<string>) {
    this.origins = new Set(origins);
  }
  assertOrigin(origin: unknown): asserts origin is string {
    if (typeof origin !== 'string' || !this.origins.has(origin))
      throw communityError(403, 'COMMUNITY_ORIGIN_REJECTED');
  }
  onModuleInit() {
    this.timer = setInterval(() => this.prune(), POLICY.sweepMs);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.tickets.clear();
  }
  private prune() {
    for (const [key, ticket] of this.tickets)
      if (ticket.expiresAt <= Date.now()) this.tickets.delete(key);
  }
  private assertCapacity(memberId: string) {
    if (
      this.connectionCount >= POLICY.totalConnections ||
      (this.connections.get(memberId) ?? 0) >= POLICY.memberConnections
    )
      throw communityError(429, 'COMMUNITY_CONNECTION_LIMIT', 5);
  }
  reserve(identity: CommunityWsIdentity): () => void {
    this.assertCapacity(identity.memberId);
    this.connectionCount++;
    this.connections.set(
      identity.memberId,
      (this.connections.get(identity.memberId) ?? 0) + 1,
    );
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.connectionCount--;
      const count = (this.connections.get(identity.memberId) ?? 1) - 1;
      if (count) this.connections.set(identity.memberId, count);
      else this.connections.delete(identity.memberId);
    };
  }
  async validateIdentity(identity: CommunityWsIdentity): Promise<void> {
    if (identity.expiresAt <= Date.now())
      throw communityError(401, 'COMMUNITY_AUTH_EXPIRED');
    if (identity.roomId !== this.community.roomId)
      throw communityError(403, 'COMMUNITY_AUTH_REVOKED');
    const user = await this.prisma.user.findUnique({
      where: { id: identity.userId },
      select: { authVersion: true },
    });
    if (!user || user.authVersion !== identity.authVersion)
      throw communityError(403, 'COMMUNITY_AUTH_REVOKED');
    const member = await this.community.member(identity.userId);
    if (member.id !== identity.memberId)
      throw communityError(403, 'COMMUNITY_AUTH_REVOKED');
  }
  async issue(
    claims: { userId: string; authVersion: number; expiresAt: number },
    origin: unknown,
  ) {
    this.assertOrigin(origin);
    if (
      !Number.isSafeInteger(claims.expiresAt) ||
      claims.expiresAt <= Date.now()
    )
      throw communityError(401, 'COMMUNITY_AUTH_EXPIRED');
    const member = await this.community.member(claims.userId);
    const identity = {
      ...claims,
      memberId: member.id,
      roomId: this.community.roomId,
    };
    await this.validateIdentity(identity);
    this.assertCapacity(member.id);
    this.prune();
    const own = [...this.tickets.values()].filter(
      (value) => value.identity.memberId === member.id,
    ).length;
    if (own >= POLICY.memberTickets || this.tickets.size >= POLICY.totalTickets)
      throw communityError(429, 'COMMUNITY_TICKET_LIMIT', 30);
    const ticket = randomBytes(32).toString('base64url');
    const expiresAt = Math.min(
      Date.now() + POLICY.ticketTtlMs,
      claims.expiresAt,
    );
    this.tickets.set(this.hash(ticket), { identity, origin, expiresAt });
    return {
      ticket,
      expiresAt: new Date(expiresAt).toISOString(),
      protocol: COMMUNITY_PROTOCOL,
    };
  }
  async consume(
    ticket: unknown,
    origin: unknown,
    onClaim?: (identity: CommunityWsIdentity) => void,
  ): Promise<CommunityWsIdentity> {
    this.assertOrigin(origin);
    if (typeof ticket !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(ticket))
      throw communityError(401, 'COMMUNITY_TICKET_INVALID');
    const key = this.hash(ticket);
    const record = this.tickets.get(key);
    // Consume synchronously before any await, including the version/member recheck.
    this.tickets.delete(key);
    if (!record || record.expiresAt <= Date.now())
      throw communityError(401, 'COMMUNITY_TICKET_INVALID');
    if (record.origin !== origin)
      throw communityError(403, 'COMMUNITY_ORIGIN_REJECTED');
    onClaim?.(record.identity);
    await this.validateIdentity(record.identity);
    return record.identity;
  }
  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
