import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/useAuthStore';
import { apiFetch } from './api';

describe('apiFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().clearAuthentication();
  });

  it('does not attach an identity to unauthenticated requests', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    await apiFetch('/api/chat/history');

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.has('Authorization')).toBe(false);
    expect(headers.has('X-Guest-User-Id')).toBe(false);
  });

  it('uses one refresh for concurrent 401 responses and replays each once', async () => {
    useAuthStore.getState().signIn({
      accessToken: 'old-access',
      user: { id: 'user-1', email: 'reader@example.com', name: '读者' },
    });
    let refreshCalls = 0;
    let refreshRequest: RequestInit | undefined;
    const businessCalls = new Map<string, number>();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === '/api/auth/refresh') {
        refreshCalls += 1;
        refreshRequest = init;
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              accessToken: 'new-access',
              user: useAuthStore.getState().user,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      const calls = (businessCalls.get(url) ?? 0) + 1;
      businessCalls.set(url, calls);
      const headers = new Headers(init?.headers);
      if (headers.get('Authorization') === 'Bearer old-access') {
        return new Response('{}', { status: 401 });
      }
      return new Response('{}', { status: 200 });
    });

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, index) => apiFetch(`/api/data/${index}`)),
    );

    expect(results.every((response) => response.status === 200)).toBe(true);
    expect(refreshCalls).toBe(1);
    expect(refreshRequest).toMatchObject({
      method: 'POST',
      credentials: 'include',
    });
    expect(refreshRequest?.body).toBeUndefined();
    expect([...businessCalls.values()]).toEqual([2, 2, 2, 2, 2]);
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: 'new-access',
    });
  });

  it('clears authentication when refresh fails', async () => {
    useAuthStore.getState().signIn({
      accessToken: 'old-access',
      user: { id: 'user-1', email: 'reader@example.com', name: '读者' },
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      String(input) === '/api/auth/refresh'
        ? new Response('{}', { status: 401 })
        : new Response('{}', { status: 401 }),
    );

    await apiFetch('/api/private');

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('does not treat a guest 401 as an expired account session', async () => {
    const guestUserId = useAuthStore.getState().guestUserId;
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 401 }));

    const response = await apiFetch('/api/private');

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().guestUserId).toBe(guestUserId);
  });

  it('keeps the local account when refresh is temporarily unavailable', async () => {
    useAuthStore.getState().signIn({
      accessToken: 'old-access',
      user: { id: 'user-1', email: 'reader@example.com', name: '读者' },
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      String(input) === '/api/auth/refresh'
        ? new Response('{}', { status: 503 })
        : new Response('{}', { status: 401 }),
    );

    await apiFetch('/api/private');

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      accessToken: 'old-access',
      user: { id: 'user-1' },
    });
  });
});
