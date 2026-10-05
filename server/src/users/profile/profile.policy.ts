import { HttpException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { ValidMediaInput, WallpaperSelection } from './profile.types';

export const SYSTEM_WALLPAPER_IDS = [
  'none',
  'mountains',
  'city',
  'anime',
  'dunes',
  'rain-city',
  'anime-town',
  'coast',
] as const;
export function profileError(
  status: number,
  code: string,
  message: string,
): never {
  throw new HttpException({ code, message }, status);
}
function invalid(): never {
  return profileError(400, 'PROFILE_INPUT_INVALID', '资料输入不合法');
}
export function normalizeProfileName(value: unknown): string {
  if (typeof value !== 'string') invalid();
  const name = value.trim();
  if (
    !name ||
    [...name].length > 50 ||
    Array.from(name).some((char) => {
      const code = char.charCodeAt(0);
      return code < 32 || (code >= 127 && code <= 159);
    })
  )
    invalid();
  return name;
}
export function assertMediaInput(
  purpose: unknown,
  contentType: unknown,
  byteSize: unknown,
): ValidMediaInput {
  if (purpose !== 'AVATAR' && purpose !== 'WALLPAPER') invalid();
  const extensions: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  if (
    typeof contentType !== 'string' ||
    !Object.hasOwn(extensions, contentType)
  )
    invalid();
  const limit = (purpose === 'AVATAR' ? 5 : 10) * 1024 ** 2;
  if (
    typeof byteSize !== 'number' ||
    !Number.isSafeInteger(byteSize) ||
    byteSize < 1 ||
    byteSize > limit
  )
    invalid();
  return { purpose, contentType, byteSize, extension: extensions[contentType] };
}
export function assertWallpaperSelection(value: unknown): WallpaperSelection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const choice = value as Record<string, unknown>;
  if (choice.mode === 'RANDOM' && Object.keys(choice).length === 1)
    return { mode: 'RANDOM' };
  if (
    choice.mode !== 'FIXED' ||
    Object.keys(choice).length !== 3 ||
    typeof choice.id !== 'string'
  )
    invalid();
  if (
    choice.kind === 'SYSTEM' &&
    (SYSTEM_WALLPAPER_IDS as readonly string[]).includes(choice.id)
  )
    return { mode: 'FIXED', kind: 'SYSTEM', id: choice.id };
  if (choice.kind === 'USER' && isUUID(choice.id))
    return { mode: 'FIXED', kind: 'USER', id: choice.id };
  return invalid();
}
