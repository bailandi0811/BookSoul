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
    'BOOK_MAX_UPLOAD_BYTES',
    'BOOK_MAX_EPUB_ENTRIES',
    'BOOK_MAX_EPUB_UNCOMPRESSED_BYTES',
    'BOOK_MAX_SECTIONS',
    'BOOK_TXT_FALLBACK_SECTION_CHARS',
    'BOOK_CHUNK_SIZE',
    'BOOK_INGESTION_POLL_MS',
    'BOOK_INGESTION_STALE_MS',
    'BOOK_EMBEDDING_BATCH_SIZE',
    'BOOK_EMBEDDING_MAX_ATTEMPTS',
    'BOOK_DELETION_RETRY_MS',
  ]) {
    if (config[name] === undefined || config[name] === '') continue;
    const value = Number(config[name]);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${name} must be a positive number`);
    }
  }

  if (config.BOOK_EMBEDDING_RETRY_BASE_MS !== undefined) {
    const retryBaseMs = Number(config.BOOK_EMBEDDING_RETRY_BASE_MS);
    if (!Number.isFinite(retryBaseMs) || retryBaseMs < 0) {
      throw new Error(
        'BOOK_EMBEDDING_RETRY_BASE_MS must be a non-negative number',
      );
    }
  }

  if (config.BOOK_CHUNK_OVERLAP !== undefined) {
    const overlap = Number(config.BOOK_CHUNK_OVERLAP);
    if (!Number.isFinite(overlap) || overlap < 0) {
      throw new Error('BOOK_CHUNK_OVERLAP must be a non-negative number');
    }
  }
  const chunkSize = Number(config.BOOK_CHUNK_SIZE ?? 800);
  const chunkOverlap = Number(config.BOOK_CHUNK_OVERLAP ?? 120);
  if (chunkOverlap >= chunkSize) {
    throw new Error('BOOK_CHUNK_OVERLAP must be smaller than BOOK_CHUNK_SIZE');
  }

  if (
    config.BOOK_INGESTION_WORKER_ENABLED !== undefined &&
    !['true', 'false'].includes(String(config.BOOK_INGESTION_WORKER_ENABLED))
  ) {
    throw new Error('BOOK_INGESTION_WORKER_ENABLED must be true or false');
  }

  return config;
}
