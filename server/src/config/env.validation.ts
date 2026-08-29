const PLACEHOLDER_SECRET = 'replace-with-a-long-random-secret';

export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const databaseUrl = String(config.DATABASE_URL ?? '').trim();
  const accessSecret = String(config.JWT_ACCESS_SECRET ?? '').trim();

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
  if (accessSecret.length < 32 || accessSecret === PLACEHOLDER_SECRET) {
    throw new Error(
      'JWT_ACCESS_SECRET must be a private value of at least 32 characters',
    );
  }

  const refreshDays = Number(config.REFRESH_TOKEN_EXPIRES_DAYS ?? 7);
  if (!Number.isFinite(refreshDays) || refreshDays <= 0) {
    throw new Error('REFRESH_TOKEN_EXPIRES_DAYS must be a positive number');
  }

  for (const name of [
    'OPENAI_REQUEST_TIMEOUT_MS',
    'MILVUS_REQUEST_TIMEOUT_MS',
  ]) {
    if (config[name] === undefined || config[name] === '') continue;
    const value = Number(config[name]);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${name} must be a positive number`);
    }
  }

  return config;
}
