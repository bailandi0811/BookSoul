import { PrismaService } from '../prisma/prisma.service';
import { AuthChallengesService } from './auth-challenges.service';
import { AuthMailDispatcher } from './auth-mail-dispatcher.service';
import { AuthMailService } from './auth-mail.service';
import { AuthEmailVerificationService } from './auth-email-verification.service';
describe('mailbox verification flows', () => {
  const user = {
    id: 'user-1',
    email: 'reader@example.invalid',
    name: 'Reader',
    emailVerifiedAt: null,
  };
  const prepared = {
    ...user,
    userId: null,
    purpose: 'REGISTRATION',
    id: 'row',
    generation: 1,
    verificationId: 'receipt',
    secret: '000123',
    expiresAt: new Date(Date.now() + 600_000),
    resendAllowedAt: new Date(Date.now() + 60_000),
  };
  const challenge = {
    issue: jest.fn(),
    markDelivery: jest.fn(),
    verify: jest.fn(),
    consume: jest.fn(),
    assertConfigured: jest.fn(),
  };
  const mail = { assertConfigured: jest.fn(), sendOtp: jest.fn() };
  const dispatcher = { assertCapacity: jest.fn(), enqueue: jest.fn() };
  const tx = {
    $queryRaw: jest.fn(),
    user: { findUnique: jest.fn(), update: jest.fn() },
  };
  const prisma = { user: tx.user, $transaction: jest.fn() };
  let service: AuthEmailVerificationService;
  beforeEach(() => {
    jest.resetAllMocks();
    challenge.issue.mockResolvedValue(prepared);
    challenge.markDelivery.mockResolvedValue(undefined);
    challenge.verify.mockResolvedValue({ status: 'invalid' });
    challenge.consume.mockResolvedValue(true);
    tx.$queryRaw.mockResolvedValue([user]);
    tx.user.findUnique.mockResolvedValue(user);
    prisma.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );
    service = new AuthEmailVerificationService(
      prisma as unknown as PrismaService,
      challenge as unknown as AuthChallengesService,
      mail as unknown as AuthMailService,
      dispatcher as unknown as AuthMailDispatcher,
    );
  });
  it('accepts code requests without creating accounts or waiting for SMTP', async () => {
    const receipt = await service.requestRegistrationCode(
      ' READER@example.invalid ',
    );
    expect(receipt).toEqual({
      verificationId: 'receipt',
      expiresInSeconds: 600,
      resendAfterSeconds: 60,
    });
    expect(challenge.issue).toHaveBeenCalledWith(
      { email: user.email, purpose: 'REGISTRATION', userId: null },
      expect.any(Function),
    );
    expect(mail.sendOtp).not.toHaveBeenCalled();
    expect(receipt).not.toHaveProperty('secret');
    const job = dispatcher.enqueue.mock.calls[0][0] as () => Promise<void>;
    await job();
    expect(challenge.markDelivery).toHaveBeenCalledWith('row', 1, 'SENT');
  });
  it('marks failed delivery including queue rejection without exposing secrets', async () => {
    dispatcher.enqueue.mockImplementation(() => {
      throw new Error('queue full');
    });
    await expect(service.requestRegistrationCode(user.email)).rejects.toThrow();
    expect(challenge.markDelivery).toHaveBeenCalledWith('row', 1, 'FAILED');
  });
  it('binds confirmation to the authenticated user, rejects invalid proof after committing', async () => {
    await expect(
      service.confirmCurrentUserEmail(user.id, {
        verificationId: 'other',
        code: '000123',
      }),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_VERIFICATION_CODE' },
    });
    expect(challenge.verify).toHaveBeenCalledWith(
      tx,
      {
        email: user.email,
        purpose: 'EMAIL_VERIFICATION',
        userId: user.id,
        verificationId: 'other',
        secret: '000123',
      },
      expect.any(Function),
    );
    expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('keeps the user identity and credentials when verifying', async () => {
    challenge.verify.mockResolvedValue({
      status: 'valid',
      challenge: { id: 'row', generation: 1 },
    });
    tx.user.update.mockImplementation(
      (input: { data: { emailVerifiedAt: Date } }) =>
        Promise.resolve({ ...user, ...input.data }),
    );
    const result = await service.confirmCurrentUserEmail(user.id, {
      verificationId: 'receipt',
      code: '000123',
    });
    expect(result.id).toBe(user.id);
    expect(result.emailVerifiedAt).not.toBeNull();
    expect(tx.user.update.mock.calls[0][0].data).toEqual({
      emailVerifiedAt: expect.any(Date),
    });
  });
  it('rejects requesting an already verified mailbox', async () => {
    tx.user.findUnique.mockResolvedValue({
      ...user,
      emailVerifiedAt: new Date(),
    });
    await expect(service.requestCurrentUserCode(user.id)).rejects.toMatchObject(
      { response: { code: 'EMAIL_ALREADY_VERIFIED' } },
    );
    expect(challenge.issue).not.toHaveBeenCalled();
  });
});
