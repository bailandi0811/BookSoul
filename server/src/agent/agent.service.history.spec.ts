import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ForbiddenException } from '@nestjs/common';
import { AgentService } from './agent.service';

describe('AgentService history ownership', () => {
  let root: string;
  let cwdSpy: jest.SpyInstance;
  let service: AgentService;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'booksoul-history-'));
    fs.mkdirSync(path.join(root, 'chat_histories'));
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(root);
    service = Object.create(AgentService.prototype) as AgentService;
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const writeHistory = (
    sessionId: string,
    userId: string | undefined,
    content = '你好',
  ) => {
    const session: Record<string, unknown> = {
      messages: [{ type: 'human', data: { content } }],
    };
    if (userId) session.userId = userId;
    fs.writeFileSync(
      path.join(root, 'chat_histories', `session_${sessionId}.json`),
      JSON.stringify({ '': { [sessionId]: session } }),
    );
  };

  it('lists only histories owned by the current identity', async () => {
    writeHistory('owned', 'user-a');
    writeHistory('other', 'user-b');
    writeHistory('legacy', undefined);

    await expect(service.getHistoryList('user-a')).resolves.toEqual([
      expect.objectContaining({ sessionId: 'owned', title: '你好' }),
    ]);
  });

  it('rejects another owner or unowned legacy history', async () => {
    writeHistory('other', 'user-b');
    writeHistory('legacy', undefined);

    await expect(
      service.getSessionHistory('other', 'user-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.getSessionHistory('legacy', 'user-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not delete another identity history', async () => {
    writeHistory('other', 'user-b');

    await expect(
      service.deleteSession('other', 'user-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(
      fs.existsSync(path.join(root, 'chat_histories', 'session_other.json')),
    ).toBe(true);
  });

  it('prevents writing to another identity session', async () => {
    writeHistory('other', 'user-b');

    await expect(
      service.assertSessionWritable('other', 'user-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects path traversal session identifiers', async () => {
    await expect(
      service.getSessionHistory('../secret', 'user-a'),
    ).rejects.toBeDefined();
  });

  it('serializes concurrent writes without losing either message pair', async () => {
    Object.defineProperty(service, 'historyLocks', { value: new Map() });
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

    const stored = JSON.parse(
      fs.readFileSync(
        path.join(root, 'chat_histories', 'session_owned.json'),
        'utf-8',
      ),
    );
    expect(stored[''].owned.messages).toHaveLength(4);
    expect(stored[''].owned.userId).toBe('user-a');
  });
});
