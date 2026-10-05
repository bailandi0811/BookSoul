import type { UploadTicket } from './profile.types';

export interface ObjectMeta {
  byteSize: number;
  contentType: string;
}
export abstract class ProfileMediaStorage {
  abstract readonly configured: boolean;
  abstract createUpload(
    key: string,
    mime: string,
    bytes: number,
    expiresAt: Date,
  ): Promise<UploadTicket['upload']>;
  abstract head(key: string): Promise<ObjectMeta | null>;
  abstract readBounded(
    key: string,
    maxBytes: number,
    signal: AbortSignal,
  ): Promise<Buffer>;
  abstract putPrivate(
    key: string,
    bytes: Buffer,
    mime: string,
    signal: AbortSignal,
  ): Promise<void>;
  abstract signRead(key: string, expiresSeconds: number): Promise<string>;
  abstract delete(key: string): Promise<void>;
}
