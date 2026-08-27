import { BadRequestException } from '@nestjs/common';
import {
  isValidGuestUserId,
  requireGuestUserId,
  requireSafePathSegment,
  resolveWithinRoot,
} from './auth-context';

describe('AuthContext utilities', () => {
  const guestId = 'guest_550e8400-e29b-41d4-a716-446655440000';

  it('accepts a random UUID-backed guest identity', () => {
    const value = guestId;
    expect(isValidGuestUserId(value)).toBe(true);
    expect(requireGuestUserId(value)).toBe(value);
  });

  it.each([
    '550e8400-e29b-41d4-a716-446655440000',
    'guest_not-a-uuid',
    'anonymous',
    '../guest_550e8400-e29b-41d4-a716-446655440000',
    'C:\\windows',
    '',
  ])('rejects unsafe guest identity %s', (value) => {
    expect(() => requireGuestUserId(value)).toThrow(BadRequestException);
  });

  it('allows only simple resource path segments', () => {
    expect(requireSafePathSegment('session_123-abc')).toBe('session_123-abc');
    expect(() => requireSafePathSegment('../secret')).toThrow(
      BadRequestException,
    );
    expect(() => requireSafePathSegment('C:\\secret')).toThrow(
      BadRequestException,
    );
  });

  it('resolves paths only inside the selected root', () => {
    expect(resolveWithinRoot('data', guestId, 'session.json')).toContain(
      guestId,
    );
    expect(() => resolveWithinRoot('data', '..', 'secret')).toThrow(
      BadRequestException,
    );
  });
});
