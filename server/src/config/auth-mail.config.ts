export function trustedAuthPublicUrl(
  raw: string | undefined,
  production = false,
): URL {
  try {
    const url = new URL(raw ?? '');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      (url.protocol !== 'https:' &&
        !(url.protocol === 'http:' && local && !production)) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error();
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    return url;
  } catch {
    throw new Error(
      'AUTH_PUBLIC_BASE_URL must be a trusted HTTPS client URL (local HTTP allowed outside production), without credentials, query or fragment',
    );
  }
}
