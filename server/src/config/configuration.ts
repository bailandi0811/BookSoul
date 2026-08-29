export default () => ({
  database: {
    url: process.env.DATABASE_URL,
  },
  books: {
    uploadDir: process.env.BOOK_UPLOAD_DIR || 'uploads/books',
    maxUploadBytes: Number(
      process.env.BOOK_MAX_UPLOAD_BYTES || 50 * 1024 * 1024,
    ),
    parserVersion: process.env.BOOK_PARSER_VERSION || 'book-parser-v1',
    embeddingVersion: process.env.BOOK_EMBEDDING_VERSION || 'book-embedding-v1',
    maxEpubEntries: Number(process.env.BOOK_MAX_EPUB_ENTRIES || 5_000),
    maxEpubUncompressedBytes: Number(
      process.env.BOOK_MAX_EPUB_UNCOMPRESSED_BYTES || 100 * 1024 * 1024,
    ),
    maxSections: Number(process.env.BOOK_MAX_SECTIONS || 5_000),
    txtFallbackSectionChars: Number(
      process.env.BOOK_TXT_FALLBACK_SECTION_CHARS || 20_000,
    ),
    chunkSize: Number(process.env.BOOK_CHUNK_SIZE || 800),
    chunkOverlap: Number(process.env.BOOK_CHUNK_OVERLAP || 120),
    ingestionPollMs: Number(process.env.BOOK_INGESTION_POLL_MS || 2_000),
    ingestionStaleMs: Number(
      process.env.BOOK_INGESTION_STALE_MS || 15 * 60 * 1_000,
    ),
    ingestionWorkerEnabled:
      process.env.BOOK_INGESTION_WORKER_ENABLED !== 'false',
    embeddingBatchSize: Number(process.env.BOOK_EMBEDDING_BATCH_SIZE || 32),
    embeddingMaxAttempts: Number(process.env.BOOK_EMBEDDING_MAX_ATTEMPTS || 3),
    embeddingRetryBaseMs: Number(
      process.env.BOOK_EMBEDDING_RETRY_BASE_MS || 500,
    ),
    deletionRetryMs: Number(process.env.BOOK_DELETION_RETRY_MS || 30_000),
  },
  auth: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
    refreshExpiresDays: Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS || 7),
  },
  milvus: {
    address: process.env.MILVUS_ADDRESS || 'localhost:19530',
    token: process.env.MILVUS_TOKEN || 'root:Milvus',
    collectionName: 'ebook',
    bookCollectionName:
      process.env.MILVUS_BOOK_COLLECTION_NAME || 'book_chunks_v2',
    vectorDim: 1024,
    requestTimeoutMs: Number(process.env.MILVUS_REQUEST_TIMEOUT_MS || 8_000),
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL,
    embeddingModel:
      process.env.EMBEDDING_MODEL_NAME || 'text-embedding-3-small',
    chatModel: process.env.MODEL_NAME || 'gpt-3.5-turbo',
    requestTimeoutMs: Number(process.env.OPENAI_REQUEST_TIMEOUT_MS || 20_000),
  },
  mcp: {
    amapApiKey: process.env.AMAP_API_KEY,
    allowedTools: (process.env.MCP_ALLOWED_TOOL_NAMES || '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
  },
});
