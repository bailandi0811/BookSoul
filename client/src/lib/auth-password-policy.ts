export function validateNewPassword(password: string): string | null {
  return [...password].length < 8 ||
    new TextEncoder().encode(password).length > 72
    ? "密码至少 8 个字符，UTF-8 编码不超过 72 字节"
    : null;
}
