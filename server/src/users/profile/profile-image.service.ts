import {
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import sharp from 'sharp';
import type { MediaPurpose } from './profile.types';

export interface NormalizedProfileImage {
  bytes: Buffer;
  width: number;
  height: number;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
}

type Waiter = { grant: () => void };
let active = 0;
const waiters: Waiter[] = [];

function aborted(): DOMException {
  return new DOMException('Profile image processing cancelled', 'AbortError');
}

function busy(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: 'MEDIA_PROCESSING_BUSY',
    message: 'Profile image processing is busy; retry later',
  });
}

function release(): void {
  const next = waiters.shift();
  if (next) next.grant();
  else active--;
}

function acquire(signal: AbortSignal): Promise<() => void> {
  if (signal.aborted) return Promise.reject(aborted());
  if (active < 2) {
    active++;
    return Promise.resolve(release);
  }
  // Bound both native work and queued buffers to avoid an unbounded memory queue.
  if (waiters.length >= 2) return Promise.reject(busy());
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
    };
    const remove = (error: Error) => {
      const index = waiters.indexOf(waiter);
      if (index < 0) return;
      waiters.splice(index, 1);
      cleanup();
      reject(error);
    };
    const cancel = () => remove(aborted());
    const waiter: Waiter = {
      grant: () => {
        cleanup();
        resolve(release);
      },
    };
    const timer = setTimeout(() => remove(busy()), 5000);
    waiters.push(waiter);
    signal.addEventListener('abort', cancel, { once: true });
  });
}

@Injectable()
export class ProfileImageService {
  async normalizeImage(
    input: Buffer,
    purpose: MediaPurpose,
    signal: AbortSignal,
  ): Promise<NormalizedProfileImage> {
    const releaseSlot = await acquire(signal);
    if (signal.aborted) {
      releaseSlot();
      throw aborted();
    }
    const work = this.transform(input, purpose, signal).finally(releaseSlot);
    // Abort stops the caller promptly; only native completion releases its slot.
    return new Promise((resolve, reject) => {
      const cancel = () => reject(aborted());
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) cancel();
      void work
        .then(resolve, reject)
        .finally(() => signal.removeEventListener('abort', cancel));
    });
  }

  private async transform(
    input: Buffer,
    purpose: MediaPurpose,
    signal: AbortSignal,
  ): Promise<NormalizedProfileImage> {
    try {
      if (!input.length || !['AVATAR', 'WALLPAPER'].includes(purpose))
        throw this.invalid();
      const pipeline = sharp(input, {
        limitInputPixels: 24_000_000,
        failOn: 'warning',
      }).timeout({ seconds: 10 });
      const metadata = await pipeline.metadata();
      if (signal.aborted) throw aborted();
      const { width, height, format } = metadata;
      if (
        !width ||
        !height ||
        width > 8192 ||
        height > 8192 ||
        width * height > 24_000_000 ||
        (metadata.pages ?? 1) > 1 ||
        metadata.loop !== undefined ||
        metadata.delay !== undefined ||
        !['jpeg', 'png', 'webp'].includes(format ?? '')
      )
        throw this.invalid();
      if (format === 'png' && this.hasPngAnimation(input)) throw this.invalid();
      pipeline.rotate();
      if (purpose === 'AVATAR')
        pipeline.resize(512, 512, { fit: 'cover', position: 'centre' });
      else
        pipeline.resize(3840, 3840, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      const result = await pipeline
        .webp({ quality: 85 })
        .toBuffer({ resolveWithObject: true });
      if (signal.aborted) throw aborted();
      return {
        bytes: result.data,
        width: result.info.width,
        height: result.info.height,
        contentType: `image/${format}` as NormalizedProfileImage['contentType'],
      };
    } catch (error) {
      if (signal.aborted) throw aborted();
      if (error instanceof UnprocessableEntityException) throw error;
      throw this.invalid();
    }
  }

  private hasPngAnimation(input: Buffer): boolean {
    let offset = 8;
    while (offset + 12 <= input.length) {
      const length = input.readUInt32BE(offset);
      if (length > input.length - offset - 12) throw this.invalid();
      const type = input.toString('ascii', offset + 4, offset + 8);
      if (type === 'acTL' || type === 'fcTL' || type === 'fdAT') return true;
      if (type === 'IEND') break;
      offset += length + 12;
    }
    return false;
  }

  private invalid(): UnprocessableEntityException {
    return new UnprocessableEntityException({
      code: 'MEDIA_INVALID_IMAGE',
      message:
        'Media must be a valid static JPEG, PNG or WebP within the image limits',
    });
  }
}
