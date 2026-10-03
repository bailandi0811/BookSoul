import { compare } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { authDbFixture } from '../../test/support/auth-db-fixture';
const fixture = authDbFixture();
jest.setTimeout(30_000);
describe('legacy identity and transactional rollback', () => {
  afterAll(() => fixture.cleanup());
  it('keeps owner, book, session and memory records through verification and reset', async () => {
    const user = await fixture.user();
    const other = await fixture.user();
    const otherSession = await fixture.auth.login({
      email: other.email,
      password: 'old-password',
    });
    const book = await fixture.db.book.create({
      data: {
        ownerId: user.id,
        title: 'Fixture novel',
        originalFileName: 'fixture.txt',
        storageKey: 'fixture-no-file-' + randomUUID(),
        mimeType: 'text/plain',
        fileSizeBytes: 1,
        contentHash: randomUUID(),
        parserVersion: 'fixture',
        embeddingVersion: 'fixture',
      },
    });
    const session = await fixture.db.chatSessionRecord.create({
      data: {
        ownerId: user.id,
        sessionId: randomUUID(),
        messages: [{ role: 'user', content: 'fixture' }],
      },
    });
    const memory = await fixture.db.memoryRecord.create({
      data: {
        id: randomUUID(),
        ownerId: user.id,
        sessionId: session.sessionId,
        bookId: book.id,
        level: 'book',
        content: 'fixture memory',
        importance: 1,
        category: 'fixture',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.authVersion).toBe(0);
    const otp = await fixture.challenges.issue(
      { email: user.email, purpose: 'EMAIL_VERIFICATION', userId: user.id },
      () => new Date(),
    );
    await fixture.challenges.markDelivery(otp.id, otp.generation, 'SENT');
    expect(
      (
        await fixture.verification.confirmCurrentUserEmail(user.id, {
          verificationId: otp.verificationId,
          code: otp.secret,
        })
      ).id,
    ).toBe(user.id);
    const proof = await fixture.resetProof(user);
    await fixture.reset.resetPassword({
      token: proof.secret,
      newPassword: 'new-password',
    });
    expect(
      await fixture.db.book.findUnique({ where: { id: book.id } }),
    ).toEqual(book);
    expect(
      await fixture.db.chatSessionRecord.findUnique({
        where: {
          ownerId_sessionId: { ownerId: user.id, sessionId: session.sessionId },
        },
      }),
    ).toEqual(session);
    expect(
      await fixture.db.memoryRecord.findUnique({ where: { id: memory.id } }),
    ).toEqual(memory);
    expect(
      (await fixture.auth.refresh(otherSession.refreshToken)).user.id,
    ).toBe(other.id);
  });
  it('rolls back consumption and account state after a business failure', async () => {
    const user = await fixture.user();
    const session = await fixture.auth.login({
      email: user.email,
      password: 'old-password',
    });
    const proof = await fixture.resetProof(user);
    const consume = jest
      .spyOn(fixture.challenges, 'consume')
      .mockRejectedValueOnce(new Error('fixture failure'));
    try {
      await expect(
        fixture.reset.resetPassword({
          token: proof.secret,
          newPassword: 'new-password',
        }),
      ).rejects.toThrow('fixture failure');
    } finally {
      consume.mockRestore();
    }
    const unchanged = await fixture.db.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(unchanged.authVersion).toBe(0);
    expect(await compare('old-password', unchanged.passwordHash)).toBe(true);
    expect(
      (
        await fixture.db.authChallenge.findUniqueOrThrow({
          where: { id: proof.id },
        })
      ).consumedAt,
    ).toBeNull();
    expect((await fixture.auth.refresh(session.refreshToken)).user.id).toBe(
      user.id,
    );
    await expect(
      fixture.reset.resetPassword({
        token: proof.secret,
        newPassword: 'new-password',
      }),
    ).resolves.toBeUndefined();
  });
});
