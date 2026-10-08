// Dedicated, opt-in test process. Never imported by production bootstrap.
import { writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ValidationPipe, type Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { McpService } from '../src/mcp/mcp.service';
import { MailerService } from '@nestjs-modules/mailer';
import { createAgenticAcceptanceTools } from './agentic-fake-tools';
import { MemoryService } from '../src/memory/memory.service';
import { MilvusService } from '../src/milvus/milvus.service';
import { UserProfileRepository } from '../src/memory/repositories/user-profile.repository';
import { MemoryEntryRepository } from '../src/memory/repositories/memory-entry.repository';
import { ImportanceScorerStrategy } from '../src/memory/strategies/importance-scorer.strategy';
import { createIsolatedDeepReadingMemory } from './deep-reading-memory-provider';
import { createRequire } from 'node:module';
import { createDeepReadingBudgetedFetch } from './deep-reading-provider-budget';
import {
  assertDeepReadingTargets,
  databaseFingerprint,
} from './deep-reading-target-guard';

export async function startDeepReadingAcceptance(
  env: NodeJS.ProcessEnv,
): Promise<void> {
  if (env.DEEP_READING_ALLOW_LIVE !== 'yes')
    throw new Error('Live test startup requires explicit consent');
  const file = env.DEEP_READING_SERVER_FINGERPRINT_FILE;
  if (!file) throw new Error('Fingerprint output is required');
  const filePath = resolve(file);
  const usageFile = filePath + '.usage.json';
  if (existsSync(filePath) || existsSync(usageFile))
    throw new Error('Refusing to overwrite an existing test artifact');
  if (!env.TEST_DATABASE_URL || !env.TEST_UPLOAD_DIR || !env.TEST_API_BASE_URL)
    throw new Error('Isolated target inputs are required');
  const processTarget = {
    pid: process.pid,
    database: databaseFingerprint(env.TEST_DATABASE_URL),
    milvusAddress: env.MILVUS_ADDRESS,
    collection: env.TEST_MILVUS_COLLECTION,
    memoryCollection: env.TEST_MILVUS_MEMORY_COLLECTION,
    uploadDir: resolve(env.TEST_UPLOAD_DIR),
    apiBaseUrl: env.TEST_API_BASE_URL,
  };
  const fingerprint = { api: processTarget, worker: processTarget };
  const safe = assertDeepReadingTargets(env, fingerprint);
  if (!env.OPENAI_BASE_URL || !env.OPENAI_API_KEY)
    throw new Error('An explicit existing model provider is required');
  const usage = { chatCalls: 0, embeddingTexts: 0, providerAttempts: 0 };
  writeFileSync(usageFile, JSON.stringify(usage), { flag: 'wx' });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = createDeepReadingBudgetedFetch(
    originalFetch,
    env.OPENAI_BASE_URL,
    safe,
    (usage) => writeFileSync(usageFile, JSON.stringify(usage)),
  );
  // Override only this explicitly approved test process, before configuration
  // modules are imported. No .env file or application deployment is changed.
  process.env.DATABASE_URL = env.TEST_DATABASE_URL;
  process.env.MILVUS_BOOK_COLLECTION_NAME = safe.collection;
  process.env.BOOK_UPLOAD_DIR = safe.uploadDir;
  process.env.AGENT_ADMISSION_MODE = 'local';
  // Quality replay uses already READY synthetic books. Do not consume unrelated
  // queued/deletion jobs even in an independent test database.
  process.env.BOOK_INGESTION_WORKER_ENABLED = 'false';
  const load = createRequire(__filename);
  const { AppModule } = load('../src/app.module') as {
    AppModule: Type<unknown>;
  };
  const isolatedModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(McpService)
    .useValue(createAgenticAcceptanceTools().mcp)
    .overrideProvider(MailerService)
    .useValue(createAgenticAcceptanceTools().mailer)
    .overrideProvider(MemoryService)
    .useFactory({
      factory: (...dependencies: ConstructorParameters<typeof MemoryService>) =>
        createIsolatedDeepReadingMemory(safe.memoryCollection, ...dependencies),
      inject: [
        ConfigService,
        MilvusService,
        UserProfileRepository,
        MemoryEntryRepository,
        ImportanceScorerStrategy,
      ],
    })
    .compile();
  const app = isolatedModule.createNestApplication({ logger: false });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const api = new URL(safe.apiBaseUrl);
  await app.listen(Number(api.port || 80), api.hostname);
  writeFileSync(filePath, JSON.stringify(fingerprint, null, 2), { flag: 'wx' });
  const stop = () => {
    void app.close().finally(() => {
      globalThis.fetch = originalFetch;
      process.exitCode = 0;
    });
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  process.stdout.write(
    'Isolated reading acceptance API/worker ready; fingerprint and transport counters recorded.\n',
  );
}
if (require.main === module) {
  void startDeepReadingAcceptance({ ...process.env }).catch(() => {
    process.stderr.write(
      'Isolated acceptance startup refused or failed; inspect targets and explicit consent without printing secrets.\n',
    );
    process.exitCode = 1;
  });
}
