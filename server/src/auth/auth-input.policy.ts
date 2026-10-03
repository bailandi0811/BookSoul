import { BadRequestException } from '@nestjs/common';
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
export function assertNewPasswordPolicy(password: string): void {
  if ([...password].length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new BadRequestException(
      '密码至少 8 个字符，UTF-8 编码不超过 72 字节',
    );
  }
}
