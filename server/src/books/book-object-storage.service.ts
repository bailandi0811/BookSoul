import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OSS from 'ali-oss';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { parseProfileMediaConfig } from '../config/profile-media.config';
import {
  BOOK_UPLOAD_MAX_BYTES,
  uploadError,
  type BookUploadPart,
  type BookUploadTicket,
} from './book-upload.policy';

const KEY =
  /^booksoul\/books\/(staging|sources)\/[0-9a-f-]{36}\/source\.(epub|txt)$/;

@Injectable()
export class BookObjectStorageService {
  readonly configured: boolean;
  private readonly client: OSS | null;
  private readonly signer: OSS | null;
  private readonly origin: string | null;

  constructor(config: ConfigService) {
    const values: Record<string, unknown> = {};
    for (const key of [
      'OSS_REGION',
      'OSS_BUCKET',
      'OSS_ACCESS_KEY_ID',
      'OSS_ACCESS_KEY_SECRET',
      'OSS_ENDPOINT',
    ])
      values[key] = config.get<unknown>(key);
    const settings = parseProfileMediaConfig(values);
    this.configured = settings !== null;
    this.origin = settings
      ? `https://${settings.bucket}.${settings.region}.aliyuncs.com`
      : null;
    const options = settings
      ? { ...settings, secure: true, timeout: 10_000, retryMax: 0 }
      : null;
    this.client = options ? new OSS(options) : null;
    this.signer = options
      ? new OSS({
          ...options,
          endpoint: `https://${settings!.region}.aliyuncs.com`,
        })
      : null;
  }

  async initialize(key: string, mime: string): Promise<string> {
    this.assertKey(key, 'staging');
    return this.call(
      async (client) =>
        (
          await client.initMultipartUpload(key, {
            mime,
            headers: { 'x-oss-object-acl': 'private' },
          })
        ).uploadId,
    );
  }

  postTicket(
    key: string,
    mime: string,
    bytes: number,
  ): NonNullable<BookUploadTicket['upload']> {
    this.assertKey(key, 'staging');
    const client = this.requireClient();
    const fields = {
      key,
      // PostObject uses this field to override the browser's file MIME type.
      'x-oss-content-type': mime,
      'x-oss-object-acl': 'private',
      'x-oss-forbid-overwrite': 'true',
      success_action_status: '204',
    };
    const policy = {
      expiration: new Date(Date.now() + 300_000).toISOString(),
      conditions: [
        ['content-length-range', bytes, bytes],
        ...Object.entries(fields).map(([name, value]) => [
          'eq',
          `$${name}`,
          value,
        ]),
      ],
    };
    try {
      return {
        method: 'POST',
        url: this.origin!,
        fields: { ...client.calculatePostSignature(policy), ...fields },
      };
    } catch {
      return this.unavailable();
    }
  }

  async partUrl(
    key: string,
    uploadId: string,
    number: number,
    bytes: number,
  ): Promise<string> {
    this.assertKey(key, 'staging');
    // Sign the browser-generated Content-Length so a ticket cannot upload an oversized part.
    this.requireClient();
    const url = new URL(
      await this.call(() =>
        this.signer!.signatureUrlV4(
          'PUT',
          300,
          {
            headers: {
              'content-length': String(bytes),
              'content-type': 'application/octet-stream',
            },
            queries: { uploadId, partNumber: String(number) },
          },
          key,
          ['content-length'],
        ),
      ),
    );
    if (url.origin !== this.origin)
      uploadError(503, 'BOOK_STORAGE_UNAVAILABLE', '小说存储暂时不可用');
    return url.href;
  }

  async parts(key: string, uploadId: string): Promise<BookUploadPart[]> {
    this.assertKey(key, 'staging');
    return this.call(async (client) => {
      const result = await client.listParts(key, uploadId);
      // The declared 50 MiB limit allows at most ten parts; reject unexpected pagination.
      if (String(result.isTruncated) === 'true')
        uploadError(422, 'BOOK_UPLOAD_PART_INVALID', '上传分片数量异常');
      return (result.parts ?? [])
        .map((part) => {
          // ali-oss returns XML field names; its declarations incorrectly spell Size as size.
          const raw = part as unknown as Record<string, unknown>;
          return {
            number: Number(raw.PartNumber),
            size: Number(raw.Size ?? raw.size),
            etag: typeof raw.ETag === 'string' ? raw.ETag : '',
          };
        })
        .sort((a, b) => a.number - b.number);
    });
  }

  async complete(
    key: string,
    uploadId: string,
    parts: BookUploadPart[],
  ): Promise<void> {
    this.assertKey(key, 'staging');
    await this.call((client) =>
      client.completeMultipartUpload(
        key,
        uploadId,
        parts.map(({ number, etag }) => ({ number, etag })),
      ),
    );
  }

  async head(key: string): Promise<{ size: number; etag: string } | null> {
    this.assertKey(key);
    try {
      const result = await this.requireClient().head(key);
      const headers = result.res.headers as Record<string, unknown>;
      const size = Number(headers['content-length']);
      const etag = headers.etag;
      if (
        !Number.isSafeInteger(size) ||
        size < 1 ||
        typeof etag !== 'string' ||
        !etag
      )
        throw new Error();
      return { size, etag };
    } catch (error) {
      if (this.missing(error, 'NoSuchKey')) return null;
      return this.unavailable();
    }
  }

  async snapshot(staging: string, target: string, etag: string): Promise<void> {
    this.assertKey(staging, 'staging');
    this.assertKey(target, 'sources');
    // Each confirmation has a new destination; conditional copy fixes the source revision.
    await this.call((client) =>
      client.copy(target, staging, {
        headers: {
          'x-oss-copy-source-if-match': etag,
          'x-oss-object-acl': 'private',
        },
      }),
    );
  }

  async withFile<T>(
    key: string,
    operation: (file: {
      path: string;
      size: number;
      sha256: string;
      prefix: Buffer;
    }) => Promise<T>,
    parent?: AbortSignal,
  ): Promise<T> {
    this.assertKey(key);
    const signal = AbortSignal.any([
      AbortSignal.timeout(60_000),
      ...(parent ? [parent] : []),
    ]);
    signal.throwIfAborted();
    const directory = await mkdtemp(join(tmpdir(), 'booksoul-source-'));
    const filePath = join(directory, 'source');
    try {
      const result = await this.call((client) => client.getStream(key));
      const stream: unknown = result.stream;
      if (!(stream instanceof Readable)) return this.unavailable();
      let size = 0;
      let prefix = Buffer.alloc(0);
      const hash = createHash('sha256');
      const counter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          if (
            !Buffer.isBuffer(chunk) ||
            chunk.length > BOOK_UPLOAD_MAX_BYTES - size
          ) {
            callback(new Error('BOOK_SOURCE_TOO_LARGE'));
            return;
          }
          size += chunk.length;
          hash.update(chunk);
          if (prefix.length < 8192)
            prefix = Buffer.concat([
              prefix,
              chunk.subarray(0, 8192 - prefix.length),
            ]);
          callback(null, chunk);
        },
      });
      try {
        await pipeline(
          stream,
          counter,
          createWriteStream(filePath, { flags: 'wx' }),
          { signal },
        );
      } catch {
        signal.throwIfAborted();
        uploadError(
          422,
          'BOOK_SOURCE_INVALID',
          '小说文件读取失败或超过大小限制',
        );
      }
      signal.throwIfAborted();
      return await operation({
        path: filePath,
        size,
        sha256: hash.digest('hex'),
        prefix,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  async delete(key: string): Promise<void> {
    this.assertKey(key);
    await this.call((client) => client.delete(key));
  }

  async abort(key: string, uploadId: string): Promise<void> {
    this.assertKey(key, 'staging');
    try {
      await this.requireClient().abortMultipartUpload(key, uploadId);
    } catch (error) {
      if (!this.missing(error, 'NoSuchUpload')) this.unavailable();
    }
  }

  private assertKey(key: string, area?: 'staging' | 'sources'): void {
    if (!KEY.test(key) || (area && !key.startsWith(`booksoul/books/${area}/`)))
      uploadError(400, 'BOOK_STORAGE_KEY_INVALID', '小说存储标识无效');
  }
  private requireClient(): OSS {
    if (!this.client)
      uploadError(
        503,
        'BOOK_STORAGE_UNAVAILABLE',
        '小说直传尚未配置，请联系管理员',
      );
    return this.client;
  }
  private missing(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === code
    );
  }
  private unavailable(): never {
    return uploadError(
      503,
      'BOOK_STORAGE_UNAVAILABLE',
      '小说存储暂时不可用，请稍后重试',
    );
  }
  private async call<T>(operation: (client: OSS) => Promise<T>): Promise<T> {
    const client = this.requireClient();
    try {
      return await operation(client);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      return this.unavailable();
    }
  }
}
