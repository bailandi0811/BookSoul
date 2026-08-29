import { PrismaService } from '../../prisma/prisma.service';
import { UserProfileRepository } from './user-profile.repository';

describe('UserProfileRepository', () => {
  const records = new Map<string, any>();
  let repository: UserProfileRepository;

  beforeEach(() => {
    records.clear();
    const key = (ownerId: string, sessionId: string) =>
      `${ownerId}:${sessionId}`;
    const userProfileRecord = {
      findUnique: jest.fn(
        async ({ where }: any) =>
          records.get(
            key(
              where.ownerId_sessionId.ownerId,
              where.ownerId_sessionId.sessionId,
            ),
          ) ?? null,
      ),
      findMany: jest.fn(async ({ where }: any) =>
        [...records.values()].filter(
          (record) => record.ownerId === where.ownerId,
        ),
      ),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const recordKey = key(
          where.ownerId_sessionId.ownerId,
          where.ownerId_sessionId.sessionId,
        );
        records.set(
          recordKey,
          records.has(recordKey)
            ? { ...records.get(recordKey), ...update }
            : { id: 'profile-id', ...create },
        );
      }),
      deleteMany: jest.fn(),
    };
    repository = new UserProfileRepository({
      userProfileRecord,
    } as unknown as PrismaService);
  });

  it('never lets profile updates replace trusted identity fields', async () => {
    await repository.save(repository.createDefault('user-a', 'session-a'));

    const updated = await repository.update('user-a', 'session-a', {
      userId: 'user-b',
      sessionId: 'session-b',
      summary: '可信摘要',
    });

    expect(updated).toMatchObject({
      userId: 'user-a',
      sessionId: 'session-a',
      summary: '可信摘要',
    });
    await expect(repository.get('user-a', 'session-a')).resolves.toMatchObject({
      userId: 'user-a',
      sessionId: 'session-a',
    });
  });

  it('only lists profiles belonging to the requested owner', async () => {
    await repository.save(repository.createDefault('user-a', 'session-a'));
    await repository.save(repository.createDefault('user-b', 'session-b'));

    await expect(repository.getByUserId('user-a')).resolves.toEqual([
      expect.objectContaining({ userId: 'user-a' }),
    ]);
  });
});
