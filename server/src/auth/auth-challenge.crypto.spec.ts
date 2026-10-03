import {
  digestOtp,
  digestResetToken,
  generateOtp,
  generateResetToken,
} from './auth-challenge.crypto';

describe('challenge secrets', () => {
  const key = 'ab'.repeat(32);
  const context = {
    id: 'row',
    generation: 1,
    purpose: 'REGISTRATION',
    email: 'reader@example.invalid',
  };
  it('generates canonical secrets with leading zero support', () => {
    for (let i = 0; i < 50; i++) expect(generateOtp()).toMatch(/^\d{6}$/);
    const token = generateResetToken();
    expect(token).toMatch(/^[\w-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(digestResetToken(token)).toMatch(/^[a-f0-9]{64}$/);
  });
  it('binds OTPs to every context field using an independent key', () => {
    const digest = digestOtp(key, context, '000123');
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    for (const changed of [
      { id: 'other' },
      { generation: 2 },
      { purpose: 'EMAIL_VERIFICATION' },
      { email: 'other@example.invalid' },
    ]) {
      expect(digestOtp(key, { ...context, ...changed }, '000123')).not.toBe(
        digest,
      );
    }
    expect(digestOtp('cd'.repeat(32), context, '000123')).not.toBe(digest);
    expect(() => digestOtp('invalid', context, '000123')).toThrow();
  });
});
