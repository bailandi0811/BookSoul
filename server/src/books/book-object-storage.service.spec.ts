import { ConfigService } from '@nestjs/config';
import OSS from 'ali-oss';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { BookObjectStorageService } from './book-object-storage.service';

jest.mock('ali-oss');
const source =
  'booksoul/books/sources/11111111-1111-4111-8111-111111111111/source.txt';
const staging = source.replace('/sources/', '/staging/');
describe('BookObjectStorageService', () => {
  const sdk = {
    signatureUrlV4: jest.fn(),
    calculatePostSignature: jest.fn(),
    getStream: jest.fn(),
    listParts: jest.fn(),
    head: jest.fn(),
    copy: jest.fn(),
    delete: jest.fn(),
  };
  let storage: BookObjectStorageService;
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(OSS).mockImplementation(() => sdk as unknown as OSS);
    storage = new BookObjectStorageService({
      get: (key: string) =>
        ({
          OSS_REGION: 'oss-cn-hangzhou',
          OSS_BUCKET: 'fixture-bucket',
          OSS_ACCESS_KEY_ID: 'fixture',
          OSS_ACCESS_KEY_SECRET: 'fixture',
        })[key],
    } as unknown as ConfigService);
  });
  it('signs exact part size and uses the public endpoint', async () => {
    sdk.signatureUrlV4.mockResolvedValue(
      'https://fixture-bucket.oss-cn-hangzhou.aliyuncs.com/source?signature=fixture',
    );
    await storage.partUrl(staging, 'upload-a', 2, 123);
    expect(sdk.signatureUrlV4).toHaveBeenCalledWith(
      'PUT',
      300,
      {
        headers: {
          'content-length': '123',
          'content-type': 'application/octet-stream',
        },
        queries: { uploadId: 'upload-a', partNumber: '2' },
      },
      staging,
      ['content-length'],
    );
  });
  it('binds PostObject MIME through the browser-independent OSS field', () => {
    sdk.calculatePostSignature.mockReturnValue({
      policy: 'fixture',
      Signature: 'fixture',
    });
    const ticket = storage.postTicket(staging, 'text/plain', 123);
    expect(ticket.fields['x-oss-content-type']).toBe('text/plain');
    expect(ticket.fields).not.toHaveProperty('Content-Type');
    expect(sdk.calculatePostSignature).toHaveBeenCalledWith({
      expiration: expect.any(String),
      conditions: [
        ['content-length-range', 123, 123],
        ['eq', '$key', staging],
        ['eq', '$x-oss-content-type', 'text/plain'],
        ['eq', '$x-oss-object-acl', 'private'],
        ['eq', '$x-oss-forbid-overwrite', 'true'],
        ['eq', '$success_action_status', '204'],
      ],
    });
  });
  it('parses the actual ali-oss XML field names and sorts parts', async () => {
    sdk.listParts.mockResolvedValue({
      isTruncated: 'false',
      parts: [
        { PartNumber: '2', Size: '1', ETag: 'b' },
        { PartNumber: '1', Size: '5242880', ETag: 'a' },
      ],
    });
    await expect(storage.parts(staging, 'upload-a')).resolves.toEqual([
      { number: 1, size: 5242880, etag: 'a' },
      { number: 2, size: 1, etag: 'b' },
    ]);
  });
  it('streams a source to an isolated temporary file, hashes it and removes it', async () => {
    const bytes = Buffer.from('合成测试正文');
    sdk.getStream.mockResolvedValue({
      stream: Readable.from([bytes.subarray(0, 3), bytes.subarray(3)]),
    });
    let materialized = '';
    await storage.withFile(source, async (file) => {
      materialized = file.path;
      expect(file.size).toBe(bytes.length);
      expect(file.sha256).toBe(
        createHash('sha256').update(bytes).digest('hex'),
      );
      expect(file.prefix).toEqual(bytes);
      expect(await readFile(file.path)).toEqual(bytes);
    });
    await expect(readFile(materialized)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
  it('rejects unsafe or unrelated keys before SDK calls', async () => {
    await expect(
      storage.delete('booksoul/profile/assets/other'),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      storage.withFile(
        'booksoul/books/sources/../source.txt',
        async () => undefined,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(sdk.delete).not.toHaveBeenCalled();
    expect(sdk.getStream).not.toHaveBeenCalled();
  });
  it('never exposes provider errors or credentials', async () => {
    sdk.copy.mockRejectedValue(new Error('private-provider-detail'));
    await expect(
      storage.snapshot(staging, source, 'etag-a'),
    ).rejects.toMatchObject({
      status: 503,
      message: expect.not.stringContaining('private-provider-detail'),
    });
  });
  it('fails closed without OSS configuration', async () => {
    const absent = new BookObjectStorageService({
      get: () => undefined,
    } as unknown as ConfigService);
    await expect(absent.head(source)).rejects.toMatchObject({ status: 503 });
  });
});
