import { basename, isAbsolute, relative, resolve } from 'node:path';
import { z } from 'zod';
import { resolveIsolatedDatabaseUrl } from '../src/prisma/testing/isolated-database';

const databaseSchema = z
  .object({
    host: z.string(),
    port: z.string(),
    database: z.string(),
    schema: z.string(),
  })
  .strict();
const processSchema = z
  .object({
    pid: z.number().int().positive(),
    database: databaseSchema,
    milvusAddress: z.string(),
    collection: z.string(),
    memoryCollection: z.string(),
    uploadDir: z.string(),
    apiBaseUrl: z.string(),
  })
  .strict();
const fingerprintSchema = z
  .object({ api: processSchema, worker: processSchema })
  .strict();
export interface SafeDeepReadingTargets {
  database: z.infer<typeof databaseSchema>;
  collection: string;
  memoryCollection: string;
  uploadDir: string;
  apiBaseUrl: string;
  maxRequests: number;
  maxChatCalls: number;
  maxEmbeddingTexts: number;
  fingerprint: z.infer<typeof fingerprintSchema>;
}
export function databaseFingerprint(
  raw: string,
): z.infer<typeof databaseSchema> {
  const url = new URL(raw);
  return {
    host: url.hostname.toLowerCase(),
    port: url.port || '5432',
    database: decodeURIComponent(url.pathname.slice(1)).toLowerCase(),
    schema: (url.searchParams.get('schema') ?? 'public').toLowerCase(),
  };
}
export function assertDeepReadingTargets(
  env: Record<string, string | undefined>,
  serverFingerprint: unknown,
): SafeDeepReadingTargets {
  const testUrl = resolveIsolatedDatabaseUrl(env);
  const required = (name: string) => {
    const value = env[name]?.trim();
    if (!value) throw new Error(`Explicit ${name} is required`);
    return value;
  };
  const budget = (name: string) => {
    const value = Number(required(name));
    if (!Number.isSafeInteger(value) || value < 1)
      throw new Error('Invalid evaluation budget');
    return value;
  };
  const collection = required('TEST_MILVUS_COLLECTION');
  if (
    !/^test_[a-z0-9_]+$/.test(collection) ||
    collection === required('MILVUS_BOOK_COLLECTION_NAME')
  )
    throw new Error('Vector collection is not isolated');
  const memoryCollection = required('TEST_MILVUS_MEMORY_COLLECTION');
  if (
    !/^test_[a-z0-9_]+$/.test(memoryCollection) ||
    memoryCollection === collection ||
    memoryCollection === 'memory_embeddings'
  )
    throw new Error('Memory collection is not isolated');
  const uploadDir = resolve(required('TEST_UPLOAD_DIR'));
  const applicationDir = resolve(required('BOOK_UPLOAD_DIR'));
  const relation = relative(applicationDir, uploadDir);
  if (
    !isAbsolute(required('TEST_UPLOAD_DIR')) ||
    !/^test_[a-z0-9_-]+$/i.test(basename(uploadDir)) ||
    !relation ||
    (!relation.startsWith('..') && !isAbsolute(relation))
  )
    throw new Error('Upload directory is not isolated');
  const apiBaseUrl = new URL(required('TEST_API_BASE_URL'));
  if (
    apiBaseUrl.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(apiBaseUrl.hostname) ||
    apiBaseUrl.username ||
    apiBaseUrl.password ||
    apiBaseUrl.search ||
    apiBaseUrl.hash ||
    apiBaseUrl.pathname !== '/'
  )
    throw new Error('Only an explicit local test API is allowed');
  const parsed = fingerprintSchema.safeParse(serverFingerprint);
  if (!parsed.success)
    throw new Error('Missing controlled API/worker fingerprints');
  const database = databaseFingerprint(testUrl);
  const address = required('MILVUS_ADDRESS');
  const normalizedApi = apiBaseUrl.origin;
  for (const process of [parsed.data.api, parsed.data.worker]) {
    if (
      JSON.stringify(process.database) !== JSON.stringify(database) ||
      process.collection !== collection ||
      process.memoryCollection !== memoryCollection ||
      resolve(process.uploadDir) !== uploadDir ||
      process.milvusAddress !== address ||
      new URL(process.apiBaseUrl).origin !== normalizedApi
    )
      throw new Error(
        'API/worker targets do not match the isolated evaluation targets',
      );
  }
  return {
    database,
    collection,
    memoryCollection,
    uploadDir,
    apiBaseUrl: normalizedApi,
    maxRequests: budget('DEEP_READING_MAX_REQUESTS'),
    maxChatCalls: budget('DEEP_READING_MAX_CHAT_CALLS'),
    maxEmbeddingTexts: budget('DEEP_READING_MAX_EMBEDDING_TEXTS'),
    fingerprint: parsed.data,
  };
}
