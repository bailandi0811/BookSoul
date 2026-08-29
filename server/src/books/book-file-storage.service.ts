import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, rmdir, unlink, writeFile } from 'fs/promises';
import * as path from 'path';
import {
  requireSafePathSegment,
  resolveWithinRoot,
} from '../auth/auth-context';

const STORAGE_KEY_PATTERN =
  /^(?:private\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+|system\/[A-Za-z0-9_-]+)\/source\.(epub|txt)$/;

@Injectable()
export class BookFileStorageService {
  private readonly root: string;

  constructor(configService: ConfigService) {
    this.root = path.resolve(
      configService.get<string>('books.uploadDir') || 'uploads/books',
    );
  }

  async save(
    ownerId: string,
    bookId: string,
    extension: 'epub' | 'txt',
    content: Buffer,
  ): Promise<string> {
    requireSafePathSegment(ownerId, '用户标识');
    requireSafePathSegment(bookId, '书籍标识');

    const storageKey = ['private', ownerId, bookId, `source.${extension}`].join(
      '/',
    );
    const absolutePath = this.resolveStorageKey(storageKey);

    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, { flag: 'wx' });
    return storageKey;
  }

  async saveSystem(
    bookId: string,
    extension: 'epub' | 'txt',
    content: Buffer,
  ): Promise<string> {
    requireSafePathSegment(bookId, '书籍标识');
    const storageKey = ['system', bookId, `source.${extension}`].join('/');
    const absolutePath = this.resolveStorageKey(storageKey);

    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, { flag: 'wx' });
    return storageKey;
  }

  async deleteByKey(storageKey: string): Promise<void> {
    const absolutePath = this.resolveStorageKey(storageKey);
    try {
      await unlink(absolutePath);
    } catch (error) {
      if (!this.isMissingFileError(error)) throw error;
    }

    await this.removeEmptyDirectory(path.dirname(absolutePath));
    await this.removeEmptyDirectory(path.dirname(path.dirname(absolutePath)));
  }

  async withLocalPath<T>(
    storageKey: string,
    operation: (absolutePath: string) => Promise<T>,
  ): Promise<T> {
    return operation(this.resolveStorageKey(storageKey));
  }

  private resolveStorageKey(storageKey: string): string {
    if (!STORAGE_KEY_PATTERN.test(storageKey)) {
      throw new Error('Invalid book storage key');
    }
    return resolveWithinRoot(this.root, ...storageKey.split('/'));
  }

  private async removeEmptyDirectory(directory: string): Promise<void> {
    try {
      await rmdir(directory);
    } catch (error) {
      const code = this.errorCode(error);
      if (code !== 'ENOENT' && code !== 'ENOTEMPTY' && code !== 'EEXIST') {
        throw error;
      }
    }
  }

  private isMissingFileError(error: unknown): boolean {
    return this.errorCode(error) === 'ENOENT';
  }

  private errorCode(error: unknown): string | undefined {
    return error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : undefined;
  }
}
