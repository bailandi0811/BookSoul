import { PrismaService } from '../../prisma/prisma.service';
import {
  MemoryCategory,
  MemoryEntry,
  MemoryLevel,
} from '../interfaces/memory.types';
import { MemoryEntryRepository } from './memory-entry.repository';

describe('MemoryEntryRepository', () => {
  const records = new Map<string, any>();
  let repository: MemoryEntryRepository;

  beforeEach(() => {
    records.clear();
    const memoryRecord = {
      findUnique: jest.fn(async ({ where }: any) => {
        const record = records.get(where.id) ?? null;
        return where && record ? { ...record } : record;
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        const record = records.get(where.id);
        return record?.ownerId === where.ownerId ? { ...record } : null;
      }),
      findMany: jest.fn(async ({ where }: any) =>
        [...records.values()]
          .filter(
            (record) =>
              record.ownerId === where.ownerId &&
              (!where.sessionId || record.sessionId === where.sessionId) &&
              (!where.level || record.level === where.level) &&
              (!where.OR ||
                where.OR.some((condition: { bookId: string | null }) =>
                  condition.bookId === null
                    ? record.bookId === null
                    : record.bookId === condition.bookId,
                )),
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      ),
      upsert: jest.fn(async ({ create, update }: any) => {
        const previous = records.get(create.id);
        records.set(create.id, previous ? { ...previous, ...update } : create);
      }),
      deleteMany: jest.fn(async ({ where }: any) => {
        const record = records.get(where.id);
        if (record?.ownerId === where.ownerId) records.delete(where.id);
      }),
    };
    repository = new MemoryEntryRepository({
      memoryRecord,
    } as unknown as PrismaService);
  });

  const entry = (id: string, sessionId: string): MemoryEntry => ({
    id,
    userId: 'user-a',
    sessionId,
    level: MemoryLevel.LONG_TERM,
    content: `memory ${id}`,
    importance: 0.8,
    category: MemoryCategory.FACT,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    metadata: { editable: true, verified: false },
  });

  it('filters every lookup by the trusted owner and session', async () => {
    await repository.save(entry('mem_one', 'session-a'));
    await repository.save(entry('mem_two', 'session-b'));

    await expect(
      repository.getByUserId('user-a', 'session-a'),
    ).resolves.toEqual([
      expect.objectContaining({ id: 'mem_one', sessionId: 'session-a' }),
    ]);
    await expect(repository.getById('mem_one', 'user-b')).resolves.toBeNull();
  });

  it('keeps immutable ownership fields during updates', async () => {
    await repository.save(entry('mem_one', 'session-a'));

    const updated = await repository.update('mem_one', 'user-a', {
      id: 'spoofed',
      userId: 'user-b',
      sessionId: 'session-b',
      createdAt: 'spoofed',
      content: 'updated',
    });

    expect(updated).toMatchObject({
      id: 'mem_one',
      userId: 'user-a',
      sessionId: 'session-a',
      createdAt: '2026-01-01T00:00:00.000Z',
      content: 'updated',
    });
  });

  it('returns only global and current-book records for book context', async () => {
    await repository.save({ ...entry('global', 'session-a'), bookId: null });
    await repository.save({
      ...entry('current', 'session-a'),
      bookId: 'book-a',
    });
    await repository.save({ ...entry('other', 'session-a'), bookId: 'book-b' });

    const result = await repository.getForBookContext('user-a', 'book-a');

    expect(result.map((memory) => memory.id).sort()).toEqual([
      'current',
      'global',
    ]);
  });
});
