import { assertNewPasswordPolicy, normalizeEmail } from './auth-input.policy';
describe('new credential policy', () => {
  it('preserves provider address semantics and enforces bcrypt bytes', () => {
    expect(normalizeEmail(' Reader+tag@Example.com ')).toBe(
      'reader+tag@example.com',
    );
    expect(() => assertNewPasswordPolicy('password')).not.toThrow();
    expect(() => assertNewPasswordPolicy('short')).toThrow();
    expect(() => assertNewPasswordPolicy('😀'.repeat(19))).toThrow();
    expect(() => assertNewPasswordPolicy('a'.repeat(72))).not.toThrow();
    expect(() => assertNewPasswordPolicy('a'.repeat(73))).toThrow();
  });
});
