import { useAuthStore, type AuthTokens } from '@/store/useAuthStore';

interface ApiOptions extends RequestInit {
  skipAuth?: boolean;
  skipRefresh?: boolean;
}

type RefreshResult =
  | { status: 'success'; data: AuthTokens }
  | { status: 'unauthorized' | 'unavailable' };

let refreshPromise: Promise<RefreshResult> | null = null;

function withIdentityHeaders(options: ApiOptions): Headers {
  const headers = new Headers(options.headers);
  const auth = useAuthStore.getState();
  if (!options.skipAuth && auth.accessToken) {
    headers.set('Authorization', `Bearer ${auth.accessToken}`);
  }
  return headers;
}

function invalidateAuthentication(): void {
  useAuthStore.getState().clearAuthentication();
  window.dispatchEvent(new Event('booksoul:auth-invalidated'));
}

async function requestTokenRefresh(): Promise<RefreshResult> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      if (response.status === 401 || response.status === 403) {
        return { status: 'unauthorized' } as const;
      }
      if (!response.ok) return { status: 'unavailable' } as const;
      const payload = (await response.json()) as {
        success: true;
        data: AuthTokens;
      };
      return { status: 'success', data: payload.data } as const;
    } catch {
      return { status: 'unavailable' } as const;
    }
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function refreshAuthentication(): Promise<boolean> {
  if (!useAuthStore.getState().user) return false;
  const result = await requestTokenRefresh();
  if (result.status === 'success') {
    useAuthStore.getState().restoreSession(result.data);
    return true;
  }
  if (result.status === 'unauthorized') invalidateAuthentication();
  return false;
}

export async function apiFetch(
  input: RequestInfo | URL,
  options: ApiOptions = {},
): Promise<Response> {
  const { skipAuth, skipRefresh, ...requestOptions } = options;
  const response = await fetch(input, {
    ...requestOptions,
    credentials: 'include',
    headers: withIdentityHeaders(options),
  });
  if (response.status !== 401 || skipRefresh || skipAuth) {
    return response;
  }
  if (!useAuthStore.getState().user) return response;
  const refreshed = await refreshAuthentication();
  if (!refreshed) return response;
  return fetch(input, {
    ...requestOptions,
    credentials: 'include',
    headers: withIdentityHeaders(options),
  });
}

export async function readApiError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      message?: string | string[];
      error?: string;
    };
    if (Array.isArray(payload.message)) return payload.message.join('，');
    return payload.message ?? payload.error ?? '请求失败，请稍后重试';
  } catch {
    return '网络请求失败，请稍后重试';
  }
}
