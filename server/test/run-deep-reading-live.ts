import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createRequire } from 'node:module';
import { assertDeepReadingTargets } from './deep-reading-target-guard';
import { fixtureSchema } from './run-deep-reading-offline';
import {
  validateAgenticSmoke,
  calculateAgenticBudget,
} from './agentic-reading-smoke';
import {
  evaluateDeepReadingCase,
  summarizeDeepReadingRows,
  summarizeDeepReadingBaselines,
  readDeepReadingStream,
  parseDeepReadingSse,
  type EvaluationRow,
} from './deep-reading-evaluation';

const replaySchema = z.object({
  baseline: z.literal('D0'),
  fixtureHash: z.string(),
  sourceHash: z.string().length(64),
  rows: z.array(
    z.object({
      id: z.string(),
      run: z.number().int().min(1).max(3),
      chunkIds: z.array(z.string()),
      answer: z.string(),
    }),
  ),
});
const bookMapSchema = z.record(z.string(), z.string().uuid());
const usageSchema = z.object({
  chatCalls: z.number().int().nonnegative(),
  embeddingTexts: z.number().int().nonnegative(),
  providerAttempts: z.number().int().nonnegative(),
});
export async function runLive(
  env: NodeJS.ProcessEnv,
  args: string[],
): Promise<void> {
  const file = env.DEEP_READING_SERVER_FINGERPRINT_FILE;
  if (!file) throw new Error('Fingerprint file is required');
  const safe = assertDeepReadingTargets(
    env,
    JSON.parse(readFileSync(file, 'utf8')) as unknown,
  );
  for (const pid of new Set([
    safe.fingerprint.api.pid,
    safe.fingerprint.worker.pid,
  ]))
    process.kill(pid, 0);
  const usage = () =>
    usageSchema.parse(
      JSON.parse(readFileSync(file + '.usage.json', 'utf8')) as unknown,
    );
  const before = usage();
  if (
    before.chatCalls > safe.maxChatCalls ||
    before.embeddingTexts > safe.maxEmbeddingTexts
  )
    throw new Error('Transport budgets already exhausted');
  const suiteIndex = args.indexOf('--suite');
  const suite = suiteIndex < 0 ? 'acceptance' : args[suiteIndex + 1];
  if (!['smoke', 'acceptance'].includes(suite))
    throw new Error('Unknown suite');
  const repeatIndex = args.indexOf('--repeats');
  const repeats =
    repeatIndex < 0
      ? suite === 'smoke'
        ? 1
        : 3
      : Number(args[repeatIndex + 1]);
  const fixtureFile =
    suite === 'smoke'
      ? 'test/fixtures/agentic-reading-smoke.json'
      : 'test/fixtures/deep-reading-mode.json';
  const raw = readFileSync(fixtureFile, 'utf8');
  const fixtureHash = createHash('sha256').update(raw).digest('hex');
  const fixtures =
    suite === 'smoke'
      ? validateAgenticSmoke(JSON.parse(raw) as unknown)
      : fixtureSchema.parse(JSON.parse(raw) as unknown);
  const split = args.includes('development') ? 'development' : 'acceptance';
  const cases = fixtures.cases.filter((item) => item.split === split);
  if (cases.some((item) => item.ceiling !== 2))
    throw new Error('This frozen replay requires ceiling 2 before writes');
  const budgets = calculateAgenticBudget(
    cases.length,
    repeats,
    2,
    fixtures.books.length,
  );
  if (
    safe.maxRequests < budgets.requests ||
    safe.maxChatCalls - before.chatCalls < budgets.chatCalls ||
    safe.maxEmbeddingTexts - before.embeddingTexts < budgets.embeddingTexts
  )
    throw new Error('Selected suite exceeds authorized budgets before writes');
  const sourceHash = createHash('sha256')
    .update(readFileSync('src/chat/agentic-book.service.ts'))
    .update(readFileSync('src/chat/book-chat.service.ts'))
    .digest('hex');
  if (!args.includes('--run')) {
    process.stdout.write(
      JSON.stringify({
        preflight: true,
        suite,
        repeats,
        cases: cases.length,
        database: safe.database,
        collection: safe.collection,
        memoryCollection: safe.memoryCollection,
        budgets,
        fixtureHash,
        sourceHash,
        tools: 'fake MCP/SMTP only',
        liveQualityVerified: false,
      }) + '\n',
    );
    return;
  }
  if (
    env.DEEP_READING_ALLOW_LIVE !== 'yes' ||
    !env.DEEP_READING_ACCESS_TOKEN ||
    !env.DEEP_READING_BOOK_MAP_FILE
  )
    throw new Error(
      'Explicit live consent, test token and prepared book map required',
    );
  const bookMap = bookMapSchema.parse(
    JSON.parse(readFileSync(env.DEEP_READING_BOOK_MAP_FILE, 'utf8')) as unknown,
  );
  const d0 = env.DEEP_READING_D0_REPLAY_FILE
    ? replaySchema.parse(
        JSON.parse(
          readFileSync(env.DEEP_READING_D0_REPLAY_FILE, 'utf8'),
        ) as unknown,
      )
    : undefined;
  if (d0 && d0.fixtureHash !== fixtureHash)
    throw new Error('D0 fixture hash differs');
  if (d0)
    for (const item of cases)
      for (let run = 1; run <= repeats; run++)
        if (
          d0.rows.filter((row) => row.id === item.id && row.run === run)
            .length !== 1
        )
          throw new Error('D0 replay incomplete before writes');
  const rows: EvaluationRow[] = [];
  const reviewRows: Array<{
    id: string;
    baseline: string;
    run: number;
    answer: string;
  }> = [];
  const measurements: Array<{
    baseline: string;
    id: string;
    run: number;
    elapsedMs: number;
    success: boolean;
    errorCode?: string;
    firstContentMs: number | null;
    toolCalls: number | null;
    providerAttempts: number;
    embeddingTexts: number;
    toolContractPassed: boolean;
    errorStage?: string;
    errorReason?: string;
  }> = [];
  const identity = z.object({
    success: z.literal(true),
    data: z.object({ user: z.object({ id: z.string() }) }),
  });
  let requests = 0;
  const request = async (
    path: string,
    body?: unknown,
    method = body === undefined ? 'GET' : 'POST',
  ) => {
    if (++requests > safe.maxRequests)
      throw new Error('HTTP request budget exhausted');
    const response = await fetch(safe.apiBaseUrl + path, {
      method,
      headers: {
        Authorization: `Bearer ${env.DEEP_READING_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(95_000),
    });
    if (!response.ok) throw new Error(`Test API returned ${response.status}`);
    return response;
  };
  const owner = identity.parse(await (await request('/api/auth/me')).json())
    .data.user.id;
  // The independent test database is opened only after target and API/worker
  // proof, consent, token, fixture and B0 validation have all succeeded.
  const load = createRequire(__filename);
  const { PrismaClient } = load(
    '@prisma/client',
  ) as typeof import('@prisma/client');
  const prisma = new PrismaClient({
    datasources: { db: { url: env.TEST_DATABASE_URL! } },
  });
  const mutations: Array<{ kind: string; id: string }> = [];
  const originalProgress = new Map<
    string,
    { mode: 'READING' | 'FINISHED'; currentSectionOrder?: number | null }
  >();
  try {
    for (const book of fixtures.books) {
      const actualId = bookMap[book.id];
      if (!actualId) throw new Error('Missing prepared fixture book');
      const payload = z
        .object({
          success: z.literal(true),
          data: z.object({ status: z.literal('READY'), title: z.string() }),
        })
        .parse(await (await request(`/api/books/${actualId}`)).json());
      if (payload.data.title !== book.title)
        throw new Error('Prepared book title differs from synthetic fixture');
      const active = await prisma.book.findFirst({
        where: {
          id: actualId,
          ownerId: owner,
          status: 'READY',
          visibility: 'PRIVATE',
        },
        select: { embeddingVersion: true },
      });
      if (!active) throw new Error('Fixture book is not owned and READY');
      const corpus = await prisma.bookChunk.findMany({
        where: {
          bookId: actualId,
          embeddingVersion: active.embeddingVersion,
          book: { ownerId: owner, status: 'READY', visibility: 'PRIVATE' },
        },
        select: { content: true, sectionOrder: true },
        orderBy: [{ sectionOrder: 'asc' }, { chunkIndex: 'asc' }],
      });
      const normalized = (text: string) => text.replace(/\s+/gu, '');
      if (
        normalized(corpus.map((chunk) => chunk.content).join('')) !==
        normalized(book.chunks.map((chunk) => chunk.text).join(''))
      )
        throw new Error(
          'Prepared book content differs from synthetic fixture; refusing model calls',
        );
    }
    for (const book of fixtures.books) {
      const actualId = bookMap[book.id];
      const progress = z
        .object({
          success: z.literal(true),
          data: z.object({
            mode: z.enum(['READING', 'FINISHED']),
            currentSectionOrder: z.number().nullable().optional(),
          }),
        })
        .parse(
          await (
            await request(`/api/books/${actualId}/reading-progress`)
          ).json(),
        );
      originalProgress.set(actualId, progress.data);
      await request(
        `/api/books/${actualId}/reading-progress`,
        { mode: 'READING', currentSectionOrder: 2 },
        'PUT',
      );
    }
    for (const item of cases)
      for (let run = 1; run <= repeats; run++) {
        if (d0) {
          const replay = d0.rows.find(
            (row) => row.id === item.id && row.run === run,
          )!;
          rows.push(
            evaluateDeepReadingCase(item, { ...replay, baseline: 'D0' }),
          );
        }
        for (const baseline of ['Q', 'D1']) {
          let started = Date.now();
          const transportBefore = usage();
          let firstContentMs: number | null = null,
            toolCalls: number | null = null,
            toolContractPassed = true;
          let errorStage: string | undefined, errorReason: string | undefined;
          let success = false;
          let errorCode: string | undefined;
          const session = z
            .object({
              success: z.literal(true),
              data: z.object({ sessionId: z.string().uuid() }),
            })
            .parse(
              await (
                await request(`/api/books/${bookMap[item.bookId]}/sessions`, {})
              ).json(),
            );
          mutations.push({ kind: 'session', id: session.data.sessionId });
          if ('memorySeed' in item && typeof item.memorySeed === 'string') {
            const seedId = `test_memory_${session.data.sessionId}`;
            await prisma.memoryRecord.create({
              data: {
                id: seedId,
                ownerId: owner,
                sessionId: session.data.sessionId,
                bookId:
                  item.memorySeed === '回答要简洁'
                    ? null
                    : bookMap[item.bookId],
                level: 'long_term',
                category: 'preference',
                content: item.memorySeed,
                importance: 0.9,
                metadata: {
                  verified: true,
                  editable: true,
                  source: 'synthetic-acceptance',
                },
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            });
            mutations.push({ kind: 'memory', id: seedId });
          }
          if (item.history.length) {
            const seeded = await prisma.chatSessionRecord.updateMany({
              where: {
                ownerId: owner,
                sessionId: session.data.sessionId,
                bookAssistant: { bookId: bookMap[item.bookId] },
              },
              data: {
                messages: item.history.map((message) => ({
                  type: message.role === 'user' ? 'human' : 'ai',
                  data: { content: message.content },
                })),
              },
            });
            if (seeded.count !== 1)
              throw new Error('Scoped fixture history could not be prepared');
          }
          let answer = '';
          const chunkIds = new Set<string>();
          try {
            started = Date.now();
            const response = await request('/api/chat', {
              sessionId: session.data.sessionId,
              message: item.question,
              retrievalMode: baseline === 'D1' ? 'deep' : 'quick',
              externalResearch:
                'allowedTools' in item &&
                item.allowedTools.includes('request_external_research'),
            });
            const streamed = await readDeepReadingStream(response, started);
            firstContentMs = streamed.firstContentMs;
            const parsed = parseDeepReadingSse(streamed.text);
            toolCalls = parsed.toolCalls ?? null;
            errorStage = parsed.errorStage;
            errorReason = parsed.errorReason;
            if (item.category === 'email')
              toolContractPassed = !!parsed.emailDraft;
            if (item.category === 'external')
              toolContractPassed = !!parsed.externalReferences?.length;
            if (
              baseline === 'D1' &&
              'maxModelCalls' in item &&
              typeof item.maxModelCalls === 'number' &&
              parsed.modelCalls !== undefined &&
              parsed.modelCalls > item.maxModelCalls
            )
              toolContractPassed = false;
            if ('expectMemoryUpdate' in item && item.expectMemoryUpdate)
              toolContractPassed =
                parsed.memoryUpdate?.hasNewMemories === true ||
                (parsed.memoryUpdate?.updatedCount ?? 0) > 0;
            if (
              item.category === 'memory' &&
              'memorySeed' in item &&
              item.memorySeed
            )
              toolContractPassed = !!parsed.answer.trim();
            answer = parsed.answer;
            errorCode = parsed.errorCode;
            for (const reference of parsed.references) {
              if (
                reference.bookId !== bookMap[item.bookId] ||
                reference.sectionOrder > item.ceiling
              )
                throw new Error('Reference boundary violation');
              const book = fixtures.books.find(
                (book) => book.id === item.bookId,
              )!;
              for (const chunk of book.chunks)
                if (reference.excerpt.includes(chunk.text))
                  chunkIds.add(chunk.id);
            }
            success = parsed.success && toolContractPassed;
          } catch {
            errorCode = 'HTTP_OR_BOUNDARY_FAILURE';
          }
          rows.push(
            evaluateDeepReadingCase(item, {
              chunkIds: [...chunkIds],
              answer,
              run,
              baseline,
            }),
          );
          reviewRows.push({ id: item.id, baseline, run, answer });
          measurements.push({
            baseline,
            id: item.id,
            run,
            elapsedMs: Date.now() - started,
            success,
            firstContentMs,
            toolCalls,
            toolContractPassed,
            providerAttempts:
              usage().providerAttempts - transportBefore.providerAttempts,
            embeddingTexts:
              usage().embeddingTexts - transportBefore.embeddingTexts,
            ...(errorStage ? { errorStage } : {}),
            ...(errorReason ? { errorReason } : {}),
            ...(errorCode ? { errorCode } : {}),
          });
        }
      }
  } finally {
    try {
      for (const [id, progress] of originalProgress)
        await request(`/api/books/${id}/reading-progress`, progress, 'PUT');
    } finally {
      await prisma.$disconnect();
    }
  }
  process.stdout.write(
    JSON.stringify(
      {
        fixtureHash,
        d0SourceHash: d0?.sourceHash ?? null,
        d0Status: d0 ? 'frozen replay' : 'not supplied',
        sourceHash,
        suite,
        repeats,
        mutations,
        byBaseline: summarizeDeepReadingBaselines(rows),
        byCategory: Object.fromEntries(
          [...new Set(rows.map((r) => r.category))].map((category) => [
            category,
            summarizeDeepReadingBaselines(
              rows.filter((r) => r.category === category),
            ),
          ]),
        ),
        unverifiedToolSemantics: true,
        split,
        rows,
        reviewRows,
        measurements,
        transportUsage: { before, after: usage() },
        summary: summarizeDeepReadingRows(rows),
        humanReviewRequired: true,
        liveQualityVerified: false,
      },
      null,
      2,
    ) + '\n',
  );
}
if (require.main === module) {
  void runLive({ ...process.env }, process.argv.slice(2)).catch(() => {
    process.stderr.write(
      'Live acceptance refused or failed; no success report was produced. Preserve fixtures; do not clear databases.\n',
    );
    process.exitCode = 1;
  });
}
