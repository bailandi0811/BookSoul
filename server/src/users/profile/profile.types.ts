import type { PublicUser } from '../users.service';

export type MediaPurpose = 'AVATAR' | 'WALLPAPER';
export type WallpaperSelection =
  | { mode: 'RANDOM' }
  | { mode: 'FIXED'; kind: 'SYSTEM' | 'USER'; id: string };
export interface ReadableMedia {
  id: string;
  url: string | null;
  expiresAt: string | null;
  width: number;
  height: number;
}
export interface ProfileSnapshot {
  user: PublicUser;
  revision: number;
  avatar: ReadableMedia | null;
  wallpapers: ReadableMedia[];
  wallpaper: WallpaperSelection;
  mediaUploadsAvailable: boolean;
  mediaReadError: 'MEDIA_STORAGE_UNAVAILABLE' | null;
}
export interface UploadTicket {
  assetId: string;
  uploadExpiresAt: string;
  commitExpiresAt: string;
  upload: { method: 'POST'; url: string; fields: Record<string, string> };
}
export interface ValidMediaInput {
  purpose: MediaPurpose;
  contentType: string;
  byteSize: number;
  extension: string;
}
