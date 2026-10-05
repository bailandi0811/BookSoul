import {
  BadRequestException,
  GoneException,
  HttpException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import { request } from 'node:https';
import OSS from 'ali-oss';
import {
  parseProfileMediaConfig,
  type ProfileMediaConfig,
} from '../../config/profile-media.config';
import { ProfileMediaStorage, type ObjectMeta } from './profile-media.storage';
import type { UploadTicket } from './profile.types';

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_INPUT_BYTES = 10 * 1024 * 1024;

type SignedUrlOptions = Omit<OSS.SignatureUrlOptions, 'method'> & {
  method: 'GET' | 'HEAD' | 'PUT' | 'DELETE';
  'x-oss-object-acl'?: 'private';
};

export class OssProfileMediaStorage extends ProfileMediaStorage {
  readonly configured = true;
  private readonly client: OSS;
  private readonly origin: string;

  constructor(config: ProfileMediaConfig) {
    super();
    const trusted = parseProfileMediaConfig({
      OSS_REGION: config.region,
      OSS_BUCKET: config.bucket,
      OSS_ACCESS_KEY_ID: config.accessKeyId,
      OSS_ACCESS_KEY_SECRET: config.accessKeySecret,
      OSS_ENDPOINT: config.endpoint,
    })!;
    const endpoint = new URL(trusted.endpoint);
    this.origin = `https://${trusted.bucket}.${endpoint.hostname}`;
    const options = {
      ...trusted,
      secure: true,
      timeout: REQUEST_TIMEOUT_MS,
      retryMax: 0,
    };
    this.client = new OSS(options);
  }

  async createUpload(
    key: string,
    mime: string,
    bytes: number,
    expiresAt: Date,
  ): Promise<UploadTicket['upload']> {
    this.assertKey(key, 'staging');
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(mime) ||
      !Number.isSafeInteger(bytes) ||
      bytes < 1 ||
      bytes > MAX_INPUT_BYTES
    ) {
      throw new BadRequestException({
        code: 'PROFILE_INPUT_INVALID',
        message: 'Invalid media upload declaration',
      });
    }
    const expiration = Math.min(expiresAt.getTime(), Date.now() + 300_000);
    if (!Number.isFinite(expiration) || expiration <= Date.now()) {
      throw new GoneException({
        code: 'MEDIA_UPLOAD_EXPIRED',
        message: 'Media upload ticket has expired',
      });
    }
    const fields = {
      key,
      'Content-Type': mime,
      'x-oss-object-acl': 'private',
      success_action_status: '204',
      'x-oss-forbid-overwrite': 'true',
    };
    const policy = {
      expiration: new Date(expiration).toISOString(),
      conditions: [
        ['eq', '$key', key],
        ['eq', '$Content-Type', mime],
        ['content-length-range', bytes, bytes],
        ['eq', '$x-oss-object-acl', 'private'],
        ['eq', '$success_action_status', '204'],
        ['eq', '$x-oss-forbid-overwrite', 'true'],
      ],
    };
    try {
      return {
        method: 'POST',
        url: this.origin,
        fields: { ...this.client.calculatePostSignature(policy), ...fields },
      };
    } catch {
      throw this.unavailable();
    }
  }

  async head(key: string): Promise<ObjectMeta | null> {
    const result = await this.requestObject(key, 'HEAD');
    if (result.status === 404) return null;
    const rawSize = result.headers['content-length'];
    const contentType = result.headers['content-type'];
    if (
      typeof rawSize !== 'string' ||
      !/^\d+$/.test(rawSize) ||
      typeof contentType !== 'string' ||
      !contentType
    )
      throw this.unavailable();
    const byteSize = Number(rawSize);
    if (!Number.isSafeInteger(byteSize)) throw this.unavailable();
    return { byteSize, contentType };
  }

  async readBounded(
    key: string,
    maxBytes: number,
    signal: AbortSignal,
  ): Promise<Buffer> {
    if (
      !Number.isSafeInteger(maxBytes) ||
      maxBytes < 1 ||
      maxBytes > MAX_INPUT_BYTES
    ) {
      throw new BadRequestException({
        code: 'PROFILE_INPUT_INVALID',
        message: 'Invalid media read limit',
      });
    }
    return (
      await this.requestObject(
        key,
        'GET',
        signal,
        undefined,
        undefined,
        maxBytes,
      )
    ).bytes;
  }

  async putPrivate(
    key: string,
    bytes: Buffer,
    mime: string,
    signal: AbortSignal,
  ): Promise<void> {
    this.assertKey(key, 'assets');
    await this.requestObject(key, 'PUT', signal, bytes, mime);
  }

  async signRead(key: string, expiresSeconds: number): Promise<string> {
    this.assertKey(key, 'assets');
    if (!Number.isSafeInteger(expiresSeconds) || expiresSeconds < 1) {
      throw new BadRequestException({
        code: 'PROFILE_INPUT_INVALID',
        message: 'Invalid media URL lifetime',
      });
    }
    return this.signedUrl(key, {
      method: 'GET',
      expires: Math.min(expiresSeconds, 900),
    }).href;
  }

  async delete(key: string): Promise<void> {
    await this.requestObject(key, 'DELETE');
  }

  private signedUrl(key: string, options: SignedUrlOptions): URL {
    try {
      // The SDK supports HEAD and x-oss-* headers; its declarations omit them.
      const url = new URL(
        this.client.signatureUrl(key, options as OSS.SignatureUrlOptions),
      );
      if (
        url.origin !== this.origin ||
        url.username ||
        url.password ||
        url.hash
      )
        throw new Error();
      return url;
    } catch {
      throw this.unavailable();
    }
  }

  private requestObject(
    key: string,
    method: 'GET' | 'HEAD' | 'PUT' | 'DELETE',
    signal?: AbortSignal,
    body?: Buffer,
    mime?: string,
    maxBytes?: number,
  ): Promise<{ status: number; headers: IncomingHttpHeaders; bytes: Buffer }> {
    this.assertKey(key);
    if (signal?.aborted) return Promise.reject(this.aborted());
    const headers =
      method === 'PUT'
        ? {
            'Content-Type': mime!,
            'Content-Length': body!.length,
            'x-oss-object-acl': 'private',
          }
        : {};
    const url = this.signedUrl(key, {
      method,
      expires: 60,
      ...(method === 'PUT'
        ? { 'Content-Type': mime!, 'x-oss-object-acl': 'private' }
        : {}),
    });
    return new Promise((resolve, reject) => {
      let settled = false;
      let response: IncomingMessage | undefined;
      const chunks: Buffer[] = [];
      let size = 0;
      let req: ReturnType<typeof request> | undefined;
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        chunks.length = 0;
        response?.destroy();
        req?.destroy();
        reject(error);
      };
      const cancel = () => fail(this.aborted());
      const timer = setTimeout(
        () => fail(this.unavailable()),
        REQUEST_TIMEOUT_MS,
      );
      signal?.addEventListener('abort', cancel, { once: true });
      try {
        req = request(url, { method, headers }, (incoming) => {
          response = incoming;
          incoming.on('error', () => fail(this.unavailable()));
          incoming.on('aborted', () => fail(this.unavailable()));
          if (settled) {
            incoming.destroy();
            return;
          }
          const status = incoming.statusCode ?? 0;
          const missing =
            method === 'HEAD' &&
            status === 404 &&
            (!incoming.headers['x-oss-error-code'] ||
              incoming.headers['x-oss-error-code'] === 'NoSuchKey');
          if (missing) {
            settled = true;
            cleanup();
            incoming.destroy();
            resolve({
              status,
              headers: incoming.headers,
              bytes: Buffer.alloc(0),
            });
            return;
          }
          const expected = method === 'DELETE' ? [204] : [200];
          if (!expected.includes(status)) {
            fail(this.unavailable());
            return;
          }
          const rawLength = incoming.headers['content-length'];
          if (
            maxBytes !== undefined &&
            rawLength !== undefined &&
            (!/^\d+$/.test(rawLength) ||
              !Number.isSafeInteger(Number(rawLength)))
          ) {
            fail(this.unavailable());
            return;
          }
          if (
            maxBytes !== undefined &&
            rawLength !== undefined &&
            Number(rawLength) > maxBytes
          ) {
            fail(this.tooLarge());
            return;
          }
          incoming.on('close', () => {
            if (!settled) fail(this.unavailable());
          });
          incoming.on('data', (chunk: unknown) => {
            if (settled || maxBytes === undefined) return;
            if (!Buffer.isBuffer(chunk)) {
              fail(this.unavailable());
              return;
            }
            if (chunk.length > maxBytes - size) {
              fail(this.tooLarge());
              return;
            }
            size += chunk.length;
            chunks.push(chunk);
          });
          incoming.on('end', () => {
            if (settled) return;
            if (
              maxBytes !== undefined &&
              rawLength !== undefined &&
              Number(rawLength) !== size
            ) {
              fail(this.unavailable());
              return;
            }
            settled = true;
            cleanup();
            resolve({
              status,
              headers: incoming.headers,
              bytes: Buffer.concat(chunks, size),
            });
          });
        });
        req.on('error', () => fail(this.unavailable()));
        req.end(body);
      } catch {
        fail(this.unavailable());
      }
    });
  }

  private assertKey(key: string, location?: 'staging' | 'assets'): void {
    if (
      !key.startsWith(`booksoul/profile/${location ? `${location}/` : ''}`) ||
      /[\\%?#]/.test(key) ||
      Array.from(key).some(
        (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
      ) ||
      key.split('/').some((part) => !part || part === '.' || part === '..')
    ) {
      throw new BadRequestException({
        code: 'PROFILE_INPUT_INVALID',
        message: 'Invalid profile media object key',
      });
    }
  }

  private unavailable(): HttpException {
    return new ServiceUnavailableException({
      code: 'MEDIA_STORAGE_UNAVAILABLE',
      message: 'Profile media storage is unavailable',
    });
  }

  private tooLarge(): HttpException {
    return new PayloadTooLargeException({
      code: 'MEDIA_TOO_LARGE',
      message: 'Profile media exceeds its byte limit',
    });
  }

  private aborted(): DOMException {
    return new DOMException('Profile media operation cancelled', 'AbortError');
  }
}
