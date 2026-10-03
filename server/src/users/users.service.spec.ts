import { PrismaService } from '../prisma/prisma.service';
import { toPublicUser, UsersService } from './users.service';
describe('public user metadata', () => {
  const user = {
    id: 'fixture',
    email: 'reader@example.invalid',
    name: 'Reader',
    emailVerifiedAt: null,
    authVersion: 2,
    passwordHash: 'private',
  };
  it('serializes only public fields and verified dates', () => {
    expect(toPublicUser(user)).toEqual({
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerifiedAt: null,
    });
    expect(
      toPublicUser({
        ...user,
        emailVerifiedAt: new Date('2026-10-02T00:00:00Z'),
      }).emailVerifiedAt,
    ).toBe('2026-10-02T00:00:00.000Z');
  });
  it('loads version and public metadata in one query without password hashes', async () => {
    const findUnique = jest.fn().mockResolvedValue(user);
    const service = new UsersService({
      user: { findUnique },
    } as unknown as PrismaService);
    expect(await service.findAuthStateById(user.id)).toEqual({
      user: toPublicUser(user),
      authVersion: 2,
    });
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(findUnique.mock.calls[0][0].select).toEqual({
      id: true,
      email: true,
      name: true,
      emailVerifiedAt: true,
      authVersion: true,
    });
  });
});
