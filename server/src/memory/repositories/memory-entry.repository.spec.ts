import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MemoryCategory, MemoryEntry, MemoryLevel } from '../interfaces/memory.types';
import { MemoryEntryRepository } from './memory-entry.repository';

describe('MemoryEntryRepository', () => {
  let root: string;
  let cwdSpy: jest.SpyInstance;
  let repository: MemoryEntryRepository;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'booksoul-memory-'));
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(root);
    repository = new MemoryEntryRepository();
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
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

  it('filters by the stored session id instead of the filename', async () => {
    await repository.save(entry('mem_one', 'session-a'));
    await repository.save(entry('mem_two', 'session-b'));

    await expect(repository.getByUserId('user-a', 'session-a')).resolves.toEqual([
      expect.objectContaining({ id: 'mem_one', sessionId: 'session-a' }),
    ]);
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
});
