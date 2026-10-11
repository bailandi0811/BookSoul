/** Report only recognized database codes, never provider messages or metadata. */
export function safeErrorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error))
    return 'UNKNOWN';
  const code: unknown = error.code;
  return typeof code === 'string' && /^P\d{4}$/.test(code) ? code : 'UNKNOWN';
}
