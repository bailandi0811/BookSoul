import { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { BookFileStorageService } from './book-file-storage.service';

describe('BookFileStorageService', () => {
  let root: string;
  let service: BookFileStorageService;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'booksoul-books-'));
    service = new BookFileStorageService({
      get: jest.fn().mockReturnValue(root),
    } as unknown as ConfigService);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('stores a private source under server-generated owner and book paths', async () => {
    const content = Buffer.from('私人小说');

    const key = await service.save('user-a', 'book-a', 'txt', content);

    expect(key).toBe('private/user-a/book-a/source.txt');
    await expect(
      readFile(path.join(root, 'private', 'user-a', 'book-a', 'source.txt')),
    ).resolves.toEqual(content);
  });

  it('removes a stored source and tolerates an already missing file', async () => {
    const key = await service.save(
      'user-a',
      'book-a',
      'epub',
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    );

    await service.deleteByKey(key);
    await expect(service.deleteByKey(key)).resolves.toBeUndefined();
  });

  it('stores a system source under a stable book path', async () => {
    const content = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

    const key = await service.saveSystem('system-book', 'epub', content);

    expect(key).toBe('system/system-book/source.epub');
    await expect(
      readFile(path.join(root, 'system', 'system-book', 'source.epub')),
    ).resolves.toEqual(content);
  });

  it('only materializes validated private storage keys', async () => {
    const content = Buffer.from('正文');
    const key = await service.save('user-a', 'book-a', 'txt', content);

    await expect(
      service.withLocalPath(key, (absolutePath) => readFile(absolutePath)),
    ).resolves.toEqual(content);
    await expect(
      service.withLocalPath('../outside.txt', async () => undefined),
    ).rejects.toThrow('Invalid book storage key');
  });

  it('rejects untrusted storage keys before touching the filesystem', async () => {
    await expect(service.deleteByKey('../../outside.txt')).rejects.toThrow(
      'Invalid book storage key',
    );
  });
});
