import { BadRequestException } from '@nestjs/common';
import * as path from 'path';

export const GUEST_USER_HEADER = 'x-guest-user-id';
const GUEST_ID_PATTERN =
  /^guest_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;

export type AuthContext =
  | { kind: 'user'; userId: string; email: string; name: string }
  | { kind: 'guest'; userId: string };

export function isValidGuestUserId(value: unknown): value is string {
  return value === 'anonymous' ||
    (typeof value === 'string' && GUEST_ID_PATTERN.test(value));
}

export function requireGuestUserId(value: unknown): string {
  if (!isValidGuestUserId(value)) {
    throw new BadRequestException('无效的访客身份');
  }
  return value;
}

export function requireSafePathSegment(
  value: unknown,
  label = '资源标识',
): string {
  if (typeof value !== 'string' || !SAFE_SEGMENT_PATTERN.test(value)) {
    throw new BadRequestException(`${label}无效`);
  }
  return value;
}

export function resolveWithinRoot(root: string, ...segments: string[]): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...segments);
  const relative = path.relative(resolvedRoot, resolved);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new BadRequestException('资源路径无效');
  }
  return resolved;
}
