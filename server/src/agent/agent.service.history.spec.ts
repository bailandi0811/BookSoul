import { AgentService } from './agent.service';

describe('AgentService history ownership', () => {
  const records = new Map<string, any>();
  let service: AgentService;

  const key = (ownerId: string, sessionId: string) => `${ownerId}:${sessionId}`;

  beforeEach(() => {
    records.clear();
    const chatSessionRecord = {
      findUnique: jest.fn(async ({ where }: any) => {
        const scope = where.ownerId_sessionId;
        return records.get(key(scope.ownerId, scope.sessionId)) ?? null;
      }),
      findMany: jest.fn(async ({ where }: any) =>
        [...records.values()]
          .filter((record) => record.ownerId === where.ownerId)
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
      ),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const scope = where.ownerId_sessionId;
        const recordKey = key(scope.ownerId, scope.sessionId);
        const existing = records.get(recordKey);
        records.set(
          recordKey,
          existing
            ? { ...existing, ...update, updatedAt: new Date() }
            : {
                ...create,
                createdAt: new Date('2026-01-01T00:00:00.000Z'),
                updatedAt: new Date('2026-01-01T00:00:00.000Z'),
              },
        );
      }),
      deleteMany: jest.fn(async ({ where }: any) => {
        records.delete(key(where.ownerId, where.sessionId));
      }),
    };
    service = Object.create(AgentService.prototype) as AgentService;
    Object.defineProperties(service, {
      prisma: { value: { chatSessionRecord } },
      historyLocks: { value: new Map() },
      logger: {
        value: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
      },
    });
  });

  const writeHistory = (sessionId: string, userId: string, content: string) => {
    records.set(key(userId, sessionId), {
      ownerId: userId,
      sessionId,
      messages: [{ type: 'human', data: { content } }],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });
  };

  it('lists only histories selected by the JWT owner id', async () => {
    writeHistory('owned', 'user-a', '你好');
    writeHistory('other', 'user-b', '秘密');

    await expect(service.getHistoryList('user-a')).resolves.toEqual([
      expect.objectContaining({ sessionId: 'owned', title: '你好' }),
    ]);
  });

  it('allows the same session id in two accounts without collision', async () => {
    writeHistory('same-session', 'user-a', 'A 的问题');
    writeHistory('same-session', 'user-b', 'B 的问题');

    await expect(
      service.getSessionHistory('same-session', 'user-a'),
    ).resolves.toEqual([{ role: 'user', content: 'A 的问题' }]);
    await expect(
      service.getSessionHistory('same-session', 'user-b'),
    ).resolves.toEqual([{ role: 'user', content: 'B 的问题' }]);
  });

  it('does not reveal another owner session through a direct lookup', async () => {
    writeHistory('other', 'user-b', '秘密');

    await expect(service.getSessionHistory('other', 'user-a')).resolves.toEqual(
      [],
    );
  });

  it('deletes only the composite owner/session resource', async () => {
    writeHistory('same-session', 'user-a', 'A');
    writeHistory('same-session', 'user-b', 'B');

    await service.deleteSession('same-session', 'user-a');

    expect(records.has(key('user-a', 'same-session'))).toBe(false);
    expect(records.has(key('user-b', 'same-session'))).toBe(true);
  });

  it('rejects path traversal session identifiers', async () => {
    await expect(
      service.getSessionHistory('../secret', 'user-a'),
    ).rejects.toBeDefined();
  });

  it('serializes concurrent writes without losing either message pair', async () => {
    const persistHistory = (
      service as unknown as {
        persistHistory: (
          sessionId: string,
          userId: string,
          query: string,
          response: string,
        ) => Promise<void>;
      }
    ).persistHistory.bind(service);

    await Promise.all([
      persistHistory('owned', 'user-a', '问题一', '回答一'),
      persistHistory('owned', 'user-a', '问题二', '回答二'),
    ]);

    expect(records.get(key('user-a', 'owned')).messages).toHaveLength(4);
  });
});
