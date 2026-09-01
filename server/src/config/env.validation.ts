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
    'MCP_TOOL_TIMEOUT_MS',
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
    'AGENT_MAX_CONCURRENT_PER_USER',
    'AGENT_MAX_CONCURRENT_GLOBAL',
    'AGENT_RUN_LEASE_TTL_MS',
    'AGENT_RUN_HEARTBEAT_MS',
    'AGENT_RETRY_AFTER_SECONDS',
    'SMTP_PORT',
    'SMTP_CONNECTION_TIMEOUT_MS',
    'SMTP_GREETING_TIMEOUT_MS',
    'SMTP_SOCKET_TIMEOUT_MS',
  ]) {
    if (config[name] === undefined || config[name] === '') continue;
    const value = Number(config[name]);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${name} must be a positive number`);
    }
  }

  const admissionMode = String(config.AGENT_ADMISSION_MODE ?? 'local').trim();
  if (!['local', 'redis'].includes(admissionMode)) {
    throw new Error('AGENT_ADMISSION_MODE must be local or redis');
  }
  if (admissionMode === 'redis') {
    const redisUrl = String(config.REDIS_URL ?? '').trim();
    let parsedRedisUrl: URL;
    try {
      parsedRedisUrl = new URL(redisUrl);
    } catch {
      throw new Error(
        'REDIS_URL must be a valid redis:// or rediss:// URL when AGENT_ADMISSION_MODE=redis',
      );
    }
    if (!['redis:', 'rediss:'].includes(parsedRedisUrl.protocol)) {
      throw new Error(
        'REDIS_URL must be a valid redis:// or rediss:// URL when AGENT_ADMISSION_MODE=redis',
      );
    }
  }

  const agentLeaseTtlMs = Number(config.AGENT_RUN_LEASE_TTL_MS ?? 120_000);
  const agentHeartbeatMs = Number(config.AGENT_RUN_HEARTBEAT_MS ?? 30_000);
  if (agentHeartbeatMs * 2 >= agentLeaseTtlMs) {
    throw new Error(
      'AGENT_RUN_HEARTBEAT_MS must be less than half of AGENT_RUN_LEASE_TTL_MS',
    );
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

  if (
    config.SMTP_SECURE !== undefined &&
    !['true', 'false'].includes(String(config.SMTP_SECURE))
  ) {
    throw new Error('SMTP_SECURE must be true or false');
  }

  const tavilyMcpUrl = String(config.TAVILY_MCP_URL ?? '').trim();
  if (tavilyMcpUrl) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(tavilyMcpUrl);
    } catch {
      throw new Error('TAVILY_MCP_URL must be a valid HTTPS URL');
    }
    if (parsedUrl.protocol !== 'https:') {
      throw new Error('TAVILY_MCP_URL must be a valid HTTPS URL');
    }
  }

  const allowedMcpTools = String(
    config.MCP_ALLOWED_TOOL_NAMES ?? 'tavily_search',
  )
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  const unsupportedMcpTool = allowedMcpTools.find(
    (name) => name !== 'tavily_search',
  );
  if (unsupportedMcpTool) {
    throw new Error(
      `MCP_ALLOWED_TOOL_NAMES contains unsupported tool: ${unsupportedMcpTool}`,
    );
  }

  return config;
}
