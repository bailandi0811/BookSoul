export const INGESTION_ERROR_CODES = [
  'UNSUPPORTED_FORMAT',
  'INVALID_EPUB',
  'UNSAFE_ARCHIVE',
  'TEXT_ENCODING_UNSUPPORTED',
  'EMPTY_CONTENT',
  'SECTION_LIMIT_EXCEEDED',
  'EMBEDDING_UNAVAILABLE',
  'VECTOR_STORE_UNAVAILABLE',
  'INTERNAL_PROCESSING_ERROR',
] as const;

export type IngestionErrorCode = (typeof INGESTION_ERROR_CODES)[number];

export class IngestionError extends Error {
  constructor(
    readonly code: IngestionErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'IngestionError';
  }
}
