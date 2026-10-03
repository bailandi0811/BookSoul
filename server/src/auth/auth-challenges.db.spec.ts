import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { resolveIsolatedDatabaseUrl } from '../prisma/testing/isolated-database';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuthChallengesService } from './auth-challenges.service';

// Validate before constructing a real client; never load application config.
const testUrl = resolveIsolatedDatabaseUrl(process.env);

describe('auth challenge database constraints', () => {
  const runId = randomUUID();
  const email = `auth-${runId}@example.invalid`;
  const userIds: string[] = [];
  const prisma = new PrismaClient({ datasources: { db: { url: testUrl } } });

  afterAll(async () => {
    await prisma.authChallenge.deleteMany({ where: { email } });
    if (userIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: userIds }, email } });
    }
    await prisma.$disconnect();
  });

  it('keeps legacy account defaults and enforces challenge uniqueness', async () => {
    const user = await prisma.user.create({
      data: { email, name: 'Auth fixture', passwordHash: 'fixture-only' },
    });
    userIds.push(user.id);
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.authVersion).toBe(0);
    const data = {
      email,
      purpose: 'EMAIL_VERIFICATION' as const,
      userId: user.id,
      secretHash: `fixture-${runId}`,
      expiresAt: new Date(Date.now() + 600_000),
      resendAllowedAt: new Date(),
      windowStartedAt: new Date(),
    };
    await prisma.authChallenge.create({ data });
    await expect(
      prisma.authChallenge.create({
        data: { ...data, secretHash: randomUUID() },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prisma.authChallenge.create({
        data: { ...data, purpose: 'PASSWORD_RESET' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await prisma.authChallenge.create({
      data: { ...data, purpose: 'PASSWORD_RESET', secretHash: randomUUID() },
    });
    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.authChallenge.count({ where: { email } })).toBe(0);
  });

  it('enforces shared quotas, single consumption, rollback, attempts and generation in PostgreSQL', async () => {
    const service = new AuthChallengesService(
      prisma as unknown as PrismaService,
      new ConfigService({
        auth: {
          challengeSecret: 'ab'.repeat(32),
          accessSecret: 'distinct-fixture-secret',
        },
      }),
    );
    let now = new Date();
    const clock = () => now;
    const target = { email, purpose: 'REGISTRATION' as const, userId: null };
    const issuance = await Promise.allSettled([
      service.issue(target, clock),
      service.issue(target, clock),
    ]);
    expect(
      issuance.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const winner = issuance.find((result) => result.status === 'fulfilled');
    if (!winner || winner.status !== 'fulfilled')
      throw new Error('Expected one issuance');
    const first = winner.value;
    await service.markDelivery(first.id, first.generation, 'SENT');
    const proof = {
      ...target,
      verificationId: first.verificationId,
      secret: first.secret,
    };
    const attempt = () =>
      prisma.$transaction(async (tx) => {
        const valid = await service.verify(tx, proof, clock);
        return (
          valid.status === 'valid' &&
          service.consume(tx, valid.challenge, clock)
        );
      });
    expect(
      (await Promise.all([attempt(), attempt()])).filter(Boolean),
    ).toHaveLength(1);
    now = new Date(now.getTime() + 60_000);
    const second = await service.issue(target, clock);
    await service.markDelivery(first.id, first.generation, 'SENT');
    expect(
      (
        await prisma.authChallenge.findUniqueOrThrow({
          where: { id: first.id },
        })
      ).deliveryState,
    ).toBe('PENDING');
    await service.markDelivery(second.id, second.generation, 'SENT');
    const secondProof = {
      ...target,
      verificationId: second.verificationId,
      secret: second.secret,
    };
    await expect(
      prisma.$transaction(async (tx) => {
        const valid = await service.verify(tx, secondProof, clock);
        if (valid.status !== 'valid') throw new Error('Expected valid');
        await service.consume(tx, valid.challenge, clock);
        throw new Error('fixture rollback');
      }),
    ).rejects.toThrow('fixture rollback');
    expect(
      (
        await prisma.authChallenge.findUniqueOrThrow({
          where: { id: first.id },
        })
      ).consumedAt,
    ).toBeNull();
    for (let i = 0; i < 5; i++)
      await prisma.$transaction((tx) =>
        service.verify(tx, { ...secondProof, secret: 'wrong' }, clock),
      );
    expect(
      (
        await prisma.authChallenge.findUniqueOrThrow({
          where: { id: first.id },
        })
      ).attempts,
    ).toBe(5);
    expect(
      await prisma.$transaction((tx) => service.verify(tx, secondProof, clock)),
    ).toEqual({ status: 'invalid' });
  });
});
