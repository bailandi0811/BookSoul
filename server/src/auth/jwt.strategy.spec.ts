import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { JwtStrategy } from './jwt.strategy';
describe('access credential versions', () => {
  const user = {
    id: 'fixture',
    email: 'reader@example.invalid',
    name: 'Reader',
    emailVerifiedAt: null,
  };
  const payload = { sub: user.id, email: user.email, type: 'access' };
  const findAuthStateById = jest.fn();
  const strategy = new JwtStrategy(
    { get: () => 'fixture-secret' } as unknown as ConfigService,
    { findAuthStateById } as unknown as UsersService,
  );
  beforeEach(() =>
    findAuthStateById.mockReset().mockResolvedValue({ user, authVersion: 0 }),
  );
  it('accepts legacy credentials only at database version zero', async () => {
    expect(await strategy.validate(payload)).toEqual(user);
    findAuthStateById.mockResolvedValue({ user, authVersion: 1 });
    await expect(strategy.validate(payload)).rejects.toThrow();
    await expect(
      strategy.validate({ ...payload, authVersion: 0 }),
    ).rejects.toThrow();
    expect(await strategy.validate({ ...payload, authVersion: 1 })).toEqual(
      user,
    );
    expect(findAuthStateById.mock.calls).toHaveLength(4);
  });
  it.each([
    null,
    [],
    {},
    { ...payload, type: 'refresh' },
    ...['1', -1, 1.5, null].map((authVersion) => ({ ...payload, authVersion })),
  ])('rejects malformed claims %p', async (claims) => {
    await expect(strategy.validate(claims)).rejects.toThrow();
    expect(findAuthStateById).not.toHaveBeenCalled();
  });
});
