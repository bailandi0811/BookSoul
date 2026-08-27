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

  it('rotates unsafe legacy guest identities', () => {
    expect(normalizeGuestUserId('anonymous')).toMatch(/^guest_/);
    expect(normalizeGuestUserId('../anonymous')).toMatch(/^guest_/);
  });

  it('moves atomically from guest to authenticated user', () => {
    useAuthStore.getState().signIn({
      accessToken: 'access',
      user: { id: 'user-1', email: 'reader@example.com', name: '读者' },
    });

    expect(useAuthStore.getState()).toMatchObject({
      accessToken: 'access',
      isAuthenticated: true,
      user: { id: 'user-1' },
    });
  });

  it('updates the access token without losing pending guest identity', () => {
    const guestUserId = useAuthStore.getState().guestUserId;
    useAuthStore.getState().signIn({
      accessToken: 'access-1',
      user: { id: 'user-1', email: 'reader@example.com', name: '读者' },
    });

    useAuthStore.getState().updateTokens('access-2');

    expect(useAuthStore.getState()).toMatchObject({
      guestUserId,
      accessToken: 'access-2',
      user: { id: 'user-1' },
    });
  });

  it('restores rotated credentials without resetting guest claim progress', () => {
    useAuthStore.getState().setClaimState('partial', '稍后重试');

    useAuthStore.getState().restoreSession({
      accessToken: 'restored-access',
      user: { id: 'user-1', email: 'reader@example.com', name: '读者' },
    });

    expect(useAuthStore.getState()).toMatchObject({
      accessToken: 'restored-access',
      user: { id: 'user-1' },
      claimState: 'partial',
      claimMessage: '稍后重试',
    });
  });

  it('clears account data without orphaning pending guest data', () => {
    const guestUserId = useAuthStore.getState().guestUserId;
    useAuthStore.getState().signIn({
      accessToken: 'access',
      user: { id: 'user-1', email: 'reader@example.com', name: '读者' },
    });

    useAuthStore.getState().clearAuthentication();

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      accessToken: null,
      isAuthenticated: false,
    });
    expect(useAuthStore.getState().guestUserId).toBe(guestUserId);
  });
});
