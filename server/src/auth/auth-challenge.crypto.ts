import { ServiceUnavailableException } from '@nestjs/common';
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}
export function generateResetToken(): string {
  return randomBytes(32).toString('base64url');
}
export function digestResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
export function assertChallengeKey(
  key: string | undefined,
): asserts key is string {
  if (!key || !/^[a-f0-9]{64}$/i.test(key))
    throw new ServiceUnavailableException('邮箱认证尚未配置');
}
export function digestOtp(
  key: string,
  context: { id: string; generation: number; purpose: string; email: string },
  code: string,
): string {
  assertChallengeKey(key);
  return createHmac('sha256', Buffer.from(key, 'hex'))
    .update(
      JSON.stringify([
        context.id,
        context.generation,
        context.purpose,
        context.email,
        code,
      ]),
    )
    .digest('hex');
}
export function matchesDigest(left: string, right: string): boolean {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === 32 && b.length === 32 && timingSafeEqual(a, b);
}
