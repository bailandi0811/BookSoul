import { assertDeepReadingTargets } from '../../test/deep-reading-target-guard';
import { resolve } from 'node:path';
const env = {
  DATABASE_URL: 'postgresql://fixture:unused@localhost/booksoul?schema=public',
  TEST_DATABASE_URL:
    'postgresql://fixture:unused@localhost/booksoul_test?schema=test_deep',
  MILVUS_ADDRESS: 'localhost:19530',
  MILVUS_BOOK_COLLECTION_NAME: 'book_chunks_v2',
  BOOK_UPLOAD_DIR: resolve('uploads/books'),
  TEST_MILVUS_COLLECTION: 'test_deep',
  TEST_MILVUS_MEMORY_COLLECTION: 'test_deep_memory',
  TEST_UPLOAD_DIR: resolve('test_uploads'),
  TEST_API_BASE_URL: 'http://127.0.0.1:3098',
  DEEP_READING_MAX_REQUESTS: '100',
  DEEP_READING_MAX_CHAT_CALLS: '500',
  DEEP_READING_MAX_EMBEDDING_TEXTS: '900',
};
const fingerprint = {
  api: {
    pid: 100,
    database: {
      host: 'localhost',
      port: '5432',
      database: 'booksoul_test',
      schema: 'test_deep',
    },
    milvusAddress: 'localhost:19530',
    collection: 'test_deep',
    memoryCollection: 'test_deep_memory',
    uploadDir: resolve('test_uploads'),
    apiBaseUrl: 'http://127.0.0.1:3098',
  },
  worker: {
    pid: 100,
    database: {
      host: 'localhost',
      port: '5432',
      database: 'booksoul_test',
      schema: 'test_deep',
    },
    milvusAddress: 'localhost:19530',
    collection: 'test_deep',
    memoryCollection: 'test_deep_memory',
    uploadDir: resolve('test_uploads'),
    apiBaseUrl: 'http://127.0.0.1:3098',
  },
};
describe('deep live target gate', () => {
  it('accepts an explicitly isolated and matching target', () => {
    expect(assertDeepReadingTargets(env, fingerprint).collection).toBe(
      'test_deep',
    );
  });
  it.each([
    { TEST_DATABASE_URL: undefined },
    { TEST_DATABASE_URL: env.DATABASE_URL },
    { TEST_DATABASE_URL: 'postgresql://x:y@localhost/booksoul_test' },
    { TEST_MILVUS_COLLECTION: 'book_chunks_v2' },
    { TEST_MILVUS_MEMORY_COLLECTION: 'memory_embeddings' },
    { TEST_MILVUS_MEMORY_COLLECTION: 'test_deep' },
    { TEST_UPLOAD_DIR: env.BOOK_UPLOAD_DIR },
    { TEST_UPLOAD_DIR: resolve('uploads/books/test_deep') },
    { TEST_API_BASE_URL: 'https://production.invalid' },
    { DEEP_READING_MAX_REQUESTS: '0' },
    { MILVUS_ADDRESS: undefined },
  ])('refuses unsafe inputs before constructing clients: %p', (change) => {
    expect(() =>
      assertDeepReadingTargets({ ...env, ...change }, fingerprint),
    ).toThrow();
  });
  it('requires API and worker fingerprints to match all targets', () => {
    expect(() =>
      assertDeepReadingTargets(env, { ...fingerprint, worker: undefined }),
    ).toThrow();
    expect(() =>
      assertDeepReadingTargets(env, {
        ...fingerprint,
        api: { ...fingerprint.api, collection: 'other' },
      }),
    ).toThrow();
    expect(() =>
      assertDeepReadingTargets(env, {
        ...fingerprint,
        worker: {
          ...fingerprint.worker,
          database: { ...fingerprint.worker.database, schema: 'public' },
        },
      }),
    ).toThrow();
  });
});
