import { beforeEach, describe, expect, it } from 'vitest';
import { normalizeGuestUserId, useAuthStore } from './useAuthStore';

describe('useAuthStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().clearAuthentication();
  });

  it('creates and keeps a valid high-entropy guest identity', () => {
    const first = useAuthStore.getState().guestUserId;
    expect(first).toMatch(
      /^guest_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(useAuthStore.getState().guestUserId).toBe(first);
  });

  it('keeps the legacy anonymous identity for existing local data', () => {
    expect(normalizeGuestUserId('anonymous')).toBe('anonymous');
    expect(normalizeGuestUserId('../anonymous')).toMatch(/^guest_/);
  });

  it('moves atomically from guest to authenticated user', () => {
    useAuthStore.getState().signIn({
      accessToken: 'access',
      refreshToken: 'refresh',
      user: { id: 'user-1', email: 'reader@example.com', name: '读者' },
    });

    expect(useAuthStore.getState()).toMatchObject({
      accessToken: 'access',
      refreshToken: 'refresh',
      isAuthenticated: true,
      user: { id: 'user-1' },
    });
  });

  it('updates both tokens without losing pending guest identity', () => {
    const guestUserId = useAuthStore.getState().guestUserId;
    useAuthStore.getState().signIn({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      user: { id: 'user-1', email: 'reader@example.com', name: '读者' },
    });

    useAuthStore.getState().updateTokens('access-2', 'refresh-2');

    expect(useAuthStore.getState()).toMatchObject({
      guestUserId,
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      user: { id: 'user-1' },
    });
  });

  it('clears account data and rotates to a new guest on logout', () => {
    const guestUserId = useAuthStore.getState().guestUserId;
    useAuthStore.getState().signIn({
      accessToken: 'access',
      refreshToken: 'refresh',
      user: { id: 'user-1', email: 'reader@example.com', name: '读者' },
    });

    useAuthStore.getState().clearAuthentication();

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
    });
    expect(useAuthStore.getState().guestUserId).not.toBe(guestUserId);
  });
});
