import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { UserProfileRepository } from './user-profile.repository';

describe('UserProfileRepository', () => {
  let root: string;
  let cwdSpy: jest.SpyInstance;
  let repository: UserProfileRepository;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'booksoul-profile-'));
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(root);
    repository = new UserProfileRepository();
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
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
});
