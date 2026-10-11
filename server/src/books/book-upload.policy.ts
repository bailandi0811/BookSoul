import { HttpException } from '@nestjs/common';

export const BOOK_UPLOAD_MAX_BYTES = 50 * 1024 ** 2;
export const BOOK_MULTIPART_THRESHOLD = 10 * 1024 ** 2;
export const BOOK_PART_BYTES = 5 * 1024 ** 2;
export const BOOK_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
export const BOOK_COMMIT_LEASE_MS = 120_000;
export const BOOK_UPLOADS_PER_USER = 2;

export function uploadError(
  status: number,
  code: string,
  message: string,
): never {
  throw new HttpException({ code, message }, status);
}

export interface CreateBookUploadInput {
  requestId: string;
  fileName: string;
  byteSize: number;
  sha256: string;
}

export interface BookUploadPart {
  number: number;
  size: number;
  etag: string;
}

export interface BookUploadTicket {
  id: string;
  status: string;
  expiresAt: string;
  byteSize: number;
  sha256: string;
  partSize: number | null;
  uploadedParts: number[];
  upload: {
    method: 'POST';
    url: string;
    fields: Record<string, string>;
  } | null;
  parts: { number: number; url: string }[];
  bookId: string | null;
}

export function assertUploadInput(input: CreateBookUploadInput): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.requestId,
    ) ||
    !/^[0-9a-f]{64}$/.test(input.sha256) ||
    !Number.isSafeInteger(input.byteSize) ||
    input.byteSize < 1 ||
    input.byteSize > BOOK_UPLOAD_MAX_BYTES ||
    input.fileName.length < 1 ||
    input.fileName.length > 255 ||
    /[\\/]/.test(input.fileName) ||
    Array.from(input.fileName).some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    ) ||
    !/\.(epub|txt)$/i.test(input.fileName)
  )
    uploadError(
      400,
      'BOOK_UPLOAD_INVALID',
      '请选择有效的 EPUB / TXT 文件，大小不能超过 50 MiB',
    );
}

export function validateParts(
  parts: BookUploadPart[],
  bytes: number,
  partSize: number,
): void {
  const expected = Math.ceil(bytes / partSize);
  if (parts.length !== expected)
    uploadError(
      409,
      'BOOK_UPLOAD_INCOMPLETE',
      '文件尚未上传完成，请重新选择原文件继续上传',
    );
  for (let i = 0; i < expected; i++) {
    if (
      parts[i].number !== i + 1 ||
      parts[i].size !== Math.min(partSize, bytes - i * partSize) ||
      !parts[i].etag
    ) {
      uploadError(
        422,
        'BOOK_UPLOAD_PART_INVALID',
        '上传分片不完整或大小不符，请重新上传',
      );
    }
  }
}
