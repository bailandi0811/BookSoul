import { EventEmitter } from 'node:events';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { request } from 'node:https';
import { PassThrough } from 'node:stream';
import OSS from 'ali-oss';
import { OssProfileMediaStorage } from './oss-profile-media.storage';

jest.mock('node:https', () => ({ request: jest.fn() }));
jest.mock('ali-oss', () => jest.fn(), { virtual: true });

describe('OssProfileMediaStorage', () => {
  const config = {
    region: 'oss-cn-hangzhou',
    bucket: 'profile-test-bucket',
    accessKeyId: 'test-key-id',
    accessKeySecret: 'test-key-secret',
    endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
  };
  const origin = 'https://profile-test-bucket.oss-cn-hangzhou.aliyuncs.com';
  const uploadKey = 'booksoul/profile/staging/test-owner/test-asset.png';
  const objectKey = 'booksoul/profile/assets/test-owner/AVATAR/test-asset.webp';
  let storage: OssProfileMediaStorage;
  let signer: { calculatePostSignature: jest.Mock; signatureUrl: jest.Mock };
  let req: EventEmitter & { end: jest.Mock; destroy: jest.Mock };
  let response: PassThrough & {
    statusCode: number;
    headers: Record<string, string>;
  };
  let deliver: () => void;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-04T06:00:00Z'));
    jest.clearAllMocks();
    signer = {
      calculatePostSignature: jest.fn((policy: unknown) => ({
        OSSAccessKeyId: 'test-key-id',
        Signature: 'test-signature',
        policy: Buffer.from(JSON.stringify(policy)).toString('base64'),
      })),
      signatureUrl: jest.fn(
        (key: string) => `${origin}/${key}?Signature=test-signature`,
      ),
    };
    jest.mocked(OSS).mockImplementation(() => signer as unknown as OSS);
    req = Object.assign(new EventEmitter(), {
      end: jest.fn(),
      destroy: jest.fn(),
    });
    response = Object.assign(new PassThrough(), {
      statusCode: 200,
      headers: {} as Record<string, string>,
    });
    jest.mocked(request).mockImplementation((_url, _options, callback) => {
      deliver = () => callback!(response as unknown as IncomingMessage);
      return req as unknown as ClientRequest;
    });
    storage = new OssProfileMediaStorage(config);
  });

  afterEach(() => {
    response.destroy();
    jest.useRealTimers();
  });

  it('signs an exact private POST policy for five minutes with no overwrite', async () => {
    const ticket = await storage.createUpload(
      uploadKey,
      'image/png',
      123,
      new Date('2026-10-04T06:05:00Z'),
    );
    expect(storage.configured).toBe(true);
    expect(ticket).toMatchObject({
      method: 'POST',
      url: origin,
      fields: {
        key: uploadKey,
        'Content-Type': 'image/png',
        'x-oss-object-acl': 'private',
        success_action_status: '204',
        'x-oss-forbid-overwrite': 'true',
        Signature: 'test-signature',
      },
    });
    expect(
      JSON.parse(Buffer.from(ticket.fields.policy, 'base64').toString()),
    ).toEqual({
      expiration: '2026-10-04T06:05:00.000Z',
      conditions: [
        ['eq', '$key', uploadKey],
        ['eq', '$Content-Type', 'image/png'],
        ['content-length-range', 123, 123],
        ['eq', '$x-oss-object-acl', 'private'],
        ['eq', '$success_action_status', '204'],
        ['eq', '$x-oss-forbid-overwrite', 'true'],
      ],
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('caps caller expiration at five minutes and rejects expired upload tickets', async () => {
    const ticket = await storage.createUpload(
      uploadKey,
      'image/png',
      123,
      new Date('2026-10-05T06:00:00Z'),
    );
    expect(
      JSON.parse(Buffer.from(ticket.fields.policy, 'base64').toString()),
    ).toHaveProperty('expiration', '2026-10-04T06:05:00.000Z');
    await expect(
      storage.createUpload(
        uploadKey,
        'image/png',
        123,
        new Date('2026-10-04T06:00:00Z'),
      ),
    ).rejects.toMatchObject({ status: 410 });
  });

  it('reads HEAD metadata and only an object 404 becomes null', async () => {
    response.headers = { 'content-length': '123', 'content-type': 'image/png' };
    const found = storage.head(uploadKey);
    deliver();
    response.end();
    await expect(found).resolves.toEqual({
      byteSize: 123,
      contentType: 'image/png',
    });
    response = Object.assign(new PassThrough(), {
      statusCode: 404,
      headers: { 'x-oss-error-code': 'NoSuchKey' },
    });
    const absent = storage.head(uploadKey);
    deliver();
    await expect(absent).resolves.toBeNull();
  });

  it.each([
    [403, {}],
    [500, {}],
    [301, { location: 'https://evil.test' }],
    [404, { 'x-oss-error-code': 'NoSuchBucket' }],
  ])(
    'propagates HEAD status %s as unavailable instead of missing',
    async (status, headers) => {
      response.statusCode = status;
      response.headers = headers;
      const operation = storage.head(uploadKey);
      deliver();
      await expect(operation).rejects.toMatchObject({
        response: { code: 'MEDIA_STORAGE_UNAVAILABLE' },
        status: 503,
      });
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects malformed HEAD metadata and network errors without exposing the signed URL', async () => {
    response.headers = { 'content-length': 'bad', 'content-type': 'image/png' };
    const malformed = storage.head(uploadKey);
    deliver();
    response.end();
    await expect(malformed).rejects.toMatchObject({ status: 503 });
    const failed = storage.head(uploadKey);
    req.emit('error', new Error(`${origin}?Signature=private-secret`));
    await expect(failed).rejects.toMatchObject({
      response: { code: 'MEDIA_STORAGE_UNAVAILABLE' },
    });
    await expect(failed).rejects.not.toThrow('private-secret');
  });

  it('collects a Buffer only within the byte limit', async () => {
    const reading = storage.readBounded(
      uploadKey,
      4,
      new AbortController().signal,
    );
    deliver();
    response.write(Buffer.from('ab'));
    response.end(Buffer.from('cd'));
    await expect(reading).resolves.toEqual(Buffer.from('abcd'));
  });

  it.each([0, -1, 1.5, Number.NaN, 10 * 1024 * 1024 + 1])(
    'rejects invalid read bound %s before requesting bytes',
    async (limit) => {
      await expect(
        storage.readBounded(uploadKey, limit, new AbortController().signal),
      ).rejects.toMatchObject({ status: 400 });
      expect(request).not.toHaveBeenCalled();
    },
  );

  it.each(['header', 'stream'])(
    'stops an oversized response at the %s boundary',
    async (mode) => {
      if (mode === 'header') response.headers = { 'content-length': '5' };
      const reading = storage.readBounded(
        uploadKey,
        4,
        new AbortController().signal,
      );
      deliver();
      if (mode === 'stream') {
        response.write(Buffer.from('abcd'));
        response.write(Buffer.from('e'));
      }
      await expect(reading).rejects.toMatchObject({
        response: { code: 'MEDIA_TOO_LARGE' },
        status: 413,
      });
      expect(req.destroy).toHaveBeenCalled();
      expect(response.destroyed).toBe(true);
    },
  );

  it.each(['before', 'headers', 'body'])(
    'aborts reads %s and destroys IO',
    async (phase) => {
      const controller = new AbortController();
      if (phase === 'before') controller.abort();
      const reading = storage.readBounded(uploadKey, 4, controller.signal);
      if (phase === 'body') {
        deliver();
        response.write(Buffer.from('a'));
      }
      controller.abort();
      await expect(reading).rejects.toMatchObject({ name: 'AbortError' });
      if (phase === 'before') expect(request).not.toHaveBeenCalled();
      else expect(req.destroy).toHaveBeenCalled();
    },
  );

  it('uses an absolute ten second deadline even before response headers', async () => {
    const reading = storage.readBounded(
      uploadKey,
      4,
      new AbortController().signal,
    );
    const assertion = expect(reading).rejects.toMatchObject({ status: 503 });
    await jest.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(req.destroy).toHaveBeenCalled();
  });

  it('rejects truncated response streams', async () => {
    const reading = storage.readBounded(
      uploadKey,
      4,
      new AbortController().signal,
    );
    deliver();
    response.emit('aborted');
    await expect(reading).rejects.toMatchObject({ status: 503 });
  });

  it('writes private WebP with cancellable PUT and exact length', async () => {
    const bytes = Buffer.from('webp');
    const writing = storage.putPrivate(
      objectKey,
      bytes,
      'image/webp',
      new AbortController().signal,
    );
    deliver();
    response.end();
    await expect(writing).resolves.toBeUndefined();
    expect(signer.signatureUrl).toHaveBeenCalledWith(
      objectKey,
      expect.objectContaining({
        method: 'PUT',
        'Content-Type': 'image/webp',
        'x-oss-object-acl': 'private',
      }),
    );
    expect(request).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        method: 'PUT',
        headers: {
          'Content-Type': 'image/webp',
          'Content-Length': 4,
          'x-oss-object-acl': 'private',
        },
      }),
      expect.any(Function),
    );
    expect(req.end).toHaveBeenCalledWith(bytes);
  });

  it('aborts a pending PUT before headers', async () => {
    const controller = new AbortController();
    const writing = storage.putPrivate(
      objectKey,
      Buffer.from('x'),
      'image/webp',
      controller.signal,
    );
    controller.abort();
    await expect(writing).rejects.toMatchObject({ name: 'AbortError' });
    expect(req.destroy).toHaveBeenCalled();
  });

  it('signs GET for no longer than fifteen minutes without changing ACL', async () => {
    await expect(storage.signRead(objectKey, 900)).resolves.toContain(origin);
    expect(signer.signatureUrl).toHaveBeenLastCalledWith(objectKey, {
      method: 'GET',
      expires: 900,
    });
    await storage.signRead(objectKey, 3600);
    expect(signer.signatureUrl).toHaveBeenLastCalledWith(objectKey, {
      method: 'GET',
      expires: 900,
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('deletes only the exact object and exposes failed deletion', async () => {
    response.statusCode = 204;
    const deletion = storage.delete(objectKey);
    deliver();
    response.end();
    await expect(deletion).resolves.toBeUndefined();
    expect(signer.signatureUrl).toHaveBeenCalledWith(objectKey, {
      method: 'DELETE',
      expires: 60,
    });
    response = Object.assign(new PassThrough(), {
      statusCode: 403,
      headers: {},
    });
    const failure = storage.delete(objectKey);
    deliver();
    await expect(failure).rejects.toMatchObject({ status: 503 });
  });

  it('rejects unsafe keys and signed redirect destinations before sending credentials', async () => {
    await expect(
      storage.head('booksoul/profile/../other'),
    ).rejects.toMatchObject({ status: 400 });
    signer.signatureUrl.mockReturnValue(
      'https://evil.test/credential?Signature=secret',
    );
    await expect(
      storage.readBounded(uploadKey, 4, new AbortController().signal),
    ).rejects.toMatchObject({ status: 503 });
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    'other/profile/key',
    'booksoul/profile//key',
    'booksoul/profile/key\\other',
    'booksoul/profile/key?other',
    'booksoul/profile/%2e%2e/key',
    'booksoul/profile/key\u0000',
    'booksoul/profile/key\u007f',
  ])('rejects unsafe object key %j before signing', async (key) => {
    await expect(storage.head(key)).rejects.toMatchObject({ status: 400 });
    expect(signer.signatureUrl).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    ['image/gif', 123],
    ['image/png', 0],
    ['image/png', 1.5],
    ['image/png', 10 * 1024 * 1024 + 1],
  ])(
    'rejects invalid upload declaration %s %s before signing',
    async (mime, bytes) => {
      await expect(
        storage.createUpload(
          uploadKey,
          mime as string,
          bytes as number,
          new Date('2026-10-04T06:05:00Z'),
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(signer.calculatePostSignature).not.toHaveBeenCalled();
    },
  );
});
