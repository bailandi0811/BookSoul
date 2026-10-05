import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ProfileMediaStorage, type ObjectMeta } from './profile-media.storage';
import type { UploadTicket } from './profile.types';

@Injectable()
export class UnconfiguredProfileMediaStorage extends ProfileMediaStorage {
  readonly configured = false;

  async createUpload(
    _key: string,
    _mime: string,
    _bytes: number,
    _expiresAt: Date,
  ): Promise<UploadTicket['upload']> {
    throw this.unavailable();
  }

  async head(_key: string): Promise<ObjectMeta | null> {
    throw this.unavailable();
  }

  async readBounded(
    _key: string,
    _maxBytes: number,
    _signal: AbortSignal,
  ): Promise<Buffer> {
    throw this.unavailable();
  }

  async putPrivate(
    _key: string,
    _bytes: Buffer,
    _mime: string,
    _signal: AbortSignal,
  ): Promise<void> {
    throw this.unavailable();
  }

  async signRead(_key: string, _expiresSeconds: number): Promise<string> {
    throw this.unavailable();
  }

  async delete(_key: string): Promise<void> {
    throw this.unavailable();
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: 'MEDIA_STORAGE_UNAVAILABLE',
      message: 'Profile media storage is not configured',
    });
  }
}
