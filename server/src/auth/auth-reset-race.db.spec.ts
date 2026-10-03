import { AuthData } from './auth.types';
import { authDbFixture, barrier } from '../../test/support/auth-db-fixture';
const fixture = authDbFixture();
jest.setTimeout(30_000);
describe('isolated password reset races', () => {
  afterAll(() => fixture.cleanup());
  it('allows exactly one concurrent reset of the same proof', async () => {
    const user = await fixture.user();
    const proof = await fixture.resetProof(user);
    const firstGate = barrier();
    const secondGate = barrier();
    const first = fixture
      .heldReset(firstGate.hook)
      .resetPassword({ token: proof.secret, newPassword: 'new-password' });
    const tasks: Promise<void>[] = [first];
    try {
      await firstGate.wait();
      const second = fixture
        .heldReset(secondGate.hook, 'before')
        .resetPassword({ token: proof.secret, newPassword: 'new-password' });
      tasks.push(second);
      await secondGate.wait();
      // Both transactions own connections; the first holds User while the second
      // has reached its lock request. No sleeps or probabilistic scheduling.
      secondGate.release();
      await Promise.resolve();
      firstGate.release();
      const results = await Promise.allSettled(tasks);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
    } finally {
      firstGate.release();
      secondGate.release();
      await Promise.allSettled(tasks);
    }
    expect(
      (await fixture.db.user.findUniqueOrThrow({ where: { id: user.id } }))
        .authVersion,
    ).toBe(1);
  });
  it.each(['refresh-first', 'reset-first'] as const)(
    'serializes %s and leaves no old credential usable',
    async (order) => {
      const user = await fixture.user();
      const session = await fixture.auth.login({
        email: user.email,
        password: 'old-password',
      });
      const proof = await fixture.resetProof(user);
      const gate = barrier();
      const tasks: Promise<unknown>[] = [];
      let refreshed: Promise<AuthData>;
      try {
        if (order === 'refresh-first') {
          refreshed = fixture
            .heldAuth('after', gate.hook)
            .refresh(session.refreshToken);
          tasks.push(refreshed);
          await gate.wait();
          tasks.push(
            fixture.reset.resetPassword({
              token: proof.secret,
              newPassword: 'new-password',
            }),
          );
        } else {
          tasks.push(
            fixture.heldReset(gate.hook).resetPassword({
              token: proof.secret,
              newPassword: 'new-password',
            }),
          );
          await gate.wait();
          refreshed = fixture.auth.refresh(session.refreshToken);
          tasks.push(refreshed);
        }
        gate.release();
        const results = await Promise.allSettled(tasks);
        if (order === 'refresh-first') {
          expect(results.every((result) => result.status === 'fulfilled')).toBe(
            true,
          );
          const credentials = await refreshed;
          const claims: unknown = await fixture.jwt.verifyAsync(
            credentials.accessToken,
            {
              secret: fixture.config.getOrThrow<string>('auth.accessSecret'),
              algorithms: ['HS256'],
            },
          );
          await expect(fixture.strategy.validate(claims)).rejects.toThrow();
        } else {
          expect(results[0].status).toBe('fulfilled');
          expect(results[1].status).toBe('rejected');
        }
        expect(
          await fixture.db.refreshToken.count({
            where: { userId: user.id, revokedAt: null },
          }),
        ).toBe(0);
      } finally {
        gate.release();
        await Promise.allSettled(tasks);
      }
    },
  );
  it('rejects an old password checked before reset commits and before the user lock', async () => {
    const user = await fixture.user();
    const proof = await fixture.resetProof(user);
    const gate = barrier();
    const login = fixture
      .heldAuth('before', gate.hook)
      .login({ email: user.email, password: 'old-password' });
    try {
      await gate.wait();
      await fixture.reset.resetPassword({
        token: proof.secret,
        newPassword: 'new-password',
      });
      gate.release();
      await expect(login).rejects.toThrow('邮箱或密码错误');
      expect(
        await fixture.db.refreshToken.count({
          where: { userId: user.id, revokedAt: null },
        }),
      ).toBe(0);
    } finally {
      gate.release();
      await Promise.allSettled([login]);
    }
  });
});
