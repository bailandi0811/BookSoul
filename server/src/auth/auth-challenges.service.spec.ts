import { ConfigService } from '@nestjs/config';
import { AuthChallenge, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthChallengesService } from './auth-challenges.service';

describe('AuthChallengesService', () => {
  let row: AuthChallenge | null;
  let now: Date;
  let afterLock: (() => void) | undefined;
  const target = {
    email: 'reader@example.invalid',
    purpose: 'REGISTRATION' as const,
    userId: null,
  };
  const clock = () => now;
  const updateMany = jest.fn();
  const tx = {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
    authChallenge: { update: jest.fn(), updateMany, findFirst: jest.fn() },
  };
  const prisma = { ...tx, $transaction: jest.fn() };
  let service: AuthChallengesService;

  beforeEach(() => {
    jest.clearAllMocks();
    row = null;
    afterLock = undefined;
    now = new Date('2026-10-02T00:00:00Z');
    tx.$executeRaw.mockResolvedValue(1);
    tx.$queryRaw.mockImplementation(() => {
      afterLock?.();
      return Promise.resolve(row ? [row] : []);
    });
    tx.authChallenge.update.mockImplementation(
      (input: { data: Partial<AuthChallenge> }) => {
        row = { ...row, ...input.data } as AuthChallenge;
        return Promise.resolve(row);
      },
    );
    updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );
    service = new AuthChallengesService(
      prisma as unknown as PrismaService,
      {
        get: (key: string) =>
          key === 'auth.challengeSecret' ? 'ab'.repeat(32) : 'jwt-secret',
      } as unknown as ConfigService,
    );
  });

  async function issue() {
    row ??= {
      id: 'internal-row',
      verificationId: 'placeholder',
      ...target,
      generation: 0,
      secretHash: '',
      expiresAt: now,
      attempts: 0,
      consumedAt: null,
      deliveryState: 'PENDING',
      resendAllowedAt: now,
      windowStartedAt: now,
      sendCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    return service.issue(target, clock);
  }
  async function ready() {
    const prepared = await issue();
    row!.deliveryState = 'SENT';
    return {
      ...target,
      verificationId: prepared.verificationId,
      secret: prepared.secret,
    };
  }
  it('issues hashed secrets, rotates receipts and enforces cooldown and hourly quota', async () => {
    const first = await issue();
    expect(first.expiresAt.getTime() - now.getTime()).toBe(600_000);
    expect(first.resendAllowedAt.getTime() - now.getTime()).toBe(60_000);
    expect(row!.secretHash).not.toBe(first.secret);
    await expect(issue()).rejects.toMatchObject({
      response: { code: 'AUTH_RATE_LIMITED', retryAfterSeconds: 60 },
    });
    now = new Date(now.getTime() + 60_000);
    const second = await issue();
    expect(second.id).toBe(first.id);
    expect(second.generation).toBe(first.generation + 1);
    expect(second.verificationId).not.toBe(first.verificationId);
    row!.sendCount = 5;
    now = new Date(now.getTime() + 60_000);
    await expect(issue()).rejects.toMatchObject({
      response: { code: 'AUTH_RATE_LIMITED' },
    });
    now = new Date('2026-10-02T01:00:00Z');
    await issue();
    expect(row!.sendCount).toBe(1);
  });
  it('cannot revive a previous delivery generation', async () => {
    await service.markDelivery('row', 2, 'SENT');
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'row', generation: 2, deliveryState: 'PENDING' },
      data: { deliveryState: 'SENT' },
    });
  });
  it('rejects expired proofs after lock and again before consumption', async () => {
    const proof = await ready();
    afterLock = () => {
      now = row!.expiresAt;
    };
    await expect(
      service.verify(tx as unknown as Prisma.TransactionClient, proof, clock),
    ).resolves.toEqual({ status: 'invalid' });
    afterLock = undefined;
    now = new Date('2026-10-02T00:01:00Z');
    const valid = await service.verify(
      tx as unknown as Prisma.TransactionClient,
      proof,
      clock,
    );
    expect(valid.status).toBe('valid');
    if (valid.status !== 'valid') throw new Error('expected valid');
    now = row!.expiresAt;
    updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      service.consume(
        tx as unknown as Prisma.TransactionClient,
        valid.challenge,
        clock,
      ),
    ).resolves.toBe(false);
  });
  it('commits five wrong attempts without throwing inside the transaction', async () => {
    const proof = await ready();
    for (let i = 0; i < 6; i++) {
      await expect(
        service.verify(
          tx as unknown as Prisma.TransactionClient,
          { ...proof, secret: 'wrong' },
          clock,
        ),
      ).resolves.toEqual({ status: 'invalid' });
    }
    expect(row!.attempts).toBe(5);
    await expect(
      service.verify(tx as unknown as Prisma.TransactionClient, proof, clock),
    ).resolves.toEqual({ status: 'invalid' });
  });
  it.each(['PENDING', 'FAILED', 'SUPPRESSED'] as const)(
    'rejects delivery state %s',
    async (state) => {
      const proof = await ready();
      row!.deliveryState = state;
      await expect(
        service.verify(tx as unknown as Prisma.TransactionClient, proof, clock),
      ).resolves.toEqual({ status: 'invalid' });
    },
  );
  it('rejects wrong bindings and old receipts, consumes once', async () => {
    const proof = await ready();
    for (const changed of [
      { email: 'other@example.invalid' },
      { userId: 'other' },
      { purpose: 'EMAIL_VERIFICATION' as const },
      { verificationId: 'old' },
    ]) {
      await expect(
        service.verify(
          tx as unknown as Prisma.TransactionClient,
          { ...proof, ...changed },
          clock,
        ),
      ).resolves.toEqual({ status: 'invalid' });
    }
    const valid = await service.verify(
      tx as unknown as Prisma.TransactionClient,
      proof,
      clock,
    );
    if (valid.status !== 'valid') throw new Error('expected valid');
    expect(
      await service.consume(
        tx as unknown as Prisma.TransactionClient,
        valid.challenge,
        clock,
      ),
    ).toBe(true);
    updateMany.mockResolvedValueOnce({ count: 0 });
    expect(
      await service.consume(
        tx as unknown as Prisma.TransactionClient,
        valid.challenge,
        clock,
      ),
    ).toBe(false);
  });
  it('limits reset lookup to canonical high entropy tokens bound to a user', async () => {
    expect(await service.findResetTarget('123456')).toBeNull();
    expect(tx.authChallenge.findFirst).not.toHaveBeenCalled();
    tx.authChallenge.findFirst.mockResolvedValue(null);
    expect(
      await service.findResetTarget(Buffer.alloc(32, 1).toString('base64url')),
    ).toBeNull();
    expect(tx.authChallenge.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          purpose: 'PASSWORD_RESET',
          userId: { not: null },
        }),
      }),
    );
  });
});
