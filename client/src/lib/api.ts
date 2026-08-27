import { useAuthStore, type AuthTokens } from '@/store/useAuthStore';

interface ApiOptions extends RequestInit {
  skipAuth?: boolean;
  skipRefresh?: boolean;
}

let refreshPromise: Promise<boolean> | null = null;

function withIdentityHeaders(options: ApiOptions): Headers {
  const headers = new Headers(options.headers);
  const auth = useAuthStore.getState();
  if (!options.skipAuth) {
    if (auth.accessToken) {
      headers.set('Authorization', `Bearer ${auth.accessToken}`);
    } else {
      headers.set('X-Guest-User-Id', auth.guestUserId);
    }
  }
  return headers;
}

async function refreshAuthentication(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const auth = useAuthStore.getState();
    if (!auth.user) return false;
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) return false;
      const payload = (await response.json()) as {
        success: true;
        data: AuthTokens;
      };
      useAuthStore
        .getState()
        .updateTokens(payload.data.accessToken);
      return true;
    } catch {
      return false;
    }
  })();

  try {
    const refreshed = await refreshPromise;
    if (!refreshed) {
      useAuthStore.getState().clearAuthentication();
      window.dispatchEvent(new Event('booksoul:auth-invalidated'));
    }
    return refreshed;
  } finally {
    refreshPromise = null;
  }
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
