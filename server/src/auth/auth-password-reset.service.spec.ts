import { compare, getRounds } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthChallengesService } from './auth-challenges.service';
import { AuthMailDispatcher } from './auth-mail-dispatcher.service';
import { AuthMailService } from './auth-mail.service';
import { AuthPasswordResetService } from './auth-password-reset.service';
describe('password recovery', () => {
  const user = {
    id: 'user-1',
    email: 'reader@example.invalid',
    authVersion: 0,
    emailVerifiedAt: null,
  };
  const target = {
    id: 'row',
    verificationId: 'receipt',
    email: user.email,
    purpose: 'PASSWORD_RESET',
    userId: user.id,
  };
  const prepared = {
    ...target,
    generation: 1,
    secret: Buffer.alloc(32, 1).toString('base64url'),
    expiresAt: new Date(Date.now() + 1_800_000),
    resendAllowedAt: new Date(Date.now() + 60_000),
  };
  const challenges = {
    assertConfigured: jest.fn(),
    issue: jest.fn(),
    markDelivery: jest.fn(),
    findResetTarget: jest.fn(),
    verify: jest.fn(),
    consume: jest.fn(),
  };
  const mail = {
    assertConfigured: jest.fn(),
    sendResetLink: jest.fn(),
    sendPasswordChanged: jest.fn(),
  };
  const dispatcher = { assertCapacity: jest.fn(), enqueue: jest.fn() };
  const tx = {
    $queryRaw: jest.fn(),
    user: { findUnique: jest.fn(), update: jest.fn() },
    refreshToken: { updateMany: jest.fn() },
  };
  const prisma = { user: tx.user, $transaction: jest.fn() };
  let service: AuthPasswordResetService;
  beforeEach(() => {
    jest.resetAllMocks();
    challenges.issue.mockImplementation((input: { userId: string | null }) =>
      Promise.resolve({ ...prepared, ...input }),
    );
    challenges.findResetTarget.mockResolvedValue(target);
    challenges.verify.mockResolvedValue({
      status: 'valid',
      challenge: { ...target, generation: 1 },
    });
    challenges.consume.mockResolvedValue(true);
    challenges.markDelivery.mockResolvedValue(undefined);
    tx.user.findUnique.mockResolvedValue(user);
    tx.$queryRaw.mockResolvedValue([user]);
    tx.user.update.mockResolvedValue(user);
    tx.refreshToken.updateMany.mockResolvedValue({ count: 2 });
    prisma.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );
    service = new AuthPasswordResetService(
      prisma as unknown as PrismaService,
      challenges as unknown as AuthChallengesService,
      mail as unknown as AuthMailService,
      dispatcher as unknown as AuthMailDispatcher,
    );
  });
  it('returns identical acknowledgements and checks quotas for existing and absent accounts', async () => {
    const existing = await service.requestReset(user.email);
    tx.user.findUnique.mockResolvedValue(null);
    const absent = await service.requestReset(user.email);
    expect(existing).toEqual(absent);
    expect(challenges.issue).toHaveBeenCalledTimes(2);
    expect(mail.sendResetLink).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
    await (dispatcher.enqueue.mock.calls[1][0] as () => Promise<void>)();
    expect(challenges.markDelivery).toHaveBeenCalledWith(
      'row',
      1,
      'SUPPRESSED',
    );
  });
  it('changes the password, advances the version, revokes only the owner and consumes together', async () => {
    await service.resetPassword({
      token: prepared.secret,
      newPassword: 'new-password',
    });
    const data = tx.user.update.mock.calls[0][0].data as {
      passwordHash: string;
      authVersion: { increment: number };
    };
    expect(getRounds(data.passwordHash)).toBe(10);
    expect(await compare('new-password', data.passwordHash)).toBe(true);
    expect(data.authVersion).toEqual({ increment: 1 });
    expect(data).not.toHaveProperty('emailVerifiedAt');
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(challenges.consume).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ id: 'row' }),
      expect.any(Function),
    );
  });
  it('does not mutate account state for invalid proofs', async () => {
    challenges.verify.mockResolvedValue({ status: 'invalid' });
    await expect(
      service.resetPassword({
        token: prepared.secret,
        newPassword: 'new-password',
      }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_RESET_TOKEN' } });
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
  });
  it('fails the transaction on failed consumption and does not notify', async () => {
    challenges.consume.mockResolvedValue(false);
    await expect(
      service.resetPassword({
        token: prepared.secret,
        newPassword: 'new-password',
      }),
    ).rejects.toThrow();
    expect(dispatcher.enqueue).not.toHaveBeenCalled();
  });
  it('keeps committed reset successful when notification queue is full', async () => {
    dispatcher.enqueue.mockImplementation(() => {
      throw new Error('queue full');
    });
    await expect(
      service.resetPassword({
        token: prepared.secret,
        newPassword: 'new-password',
      }),
    ).resolves.toBeUndefined();
    expect(challenges.consume).toHaveBeenCalled();
  });
});
