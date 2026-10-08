import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { config as loadEnvironment } from 'dotenv';
import { z } from 'zod';
import configuration from '../src/config/configuration';
import { TarotProviderService } from '../src/tarot/tarot-provider.service';
import { TAROT_READING_PROMPT_VERSION } from '../src/tarot/tarot-reading.prompt';
import { TAROT_SELECTION_SKILL_METADATA } from '../src/agent-skills/tarot-agent-skills';
import {
  parseEvaluationFixtures,
  openEvaluationReport,
  runTarotEvaluation,
  summarizeEvaluation,
  type EvaluationResult,
} from './tarot-evaluation';

// Standalone opt-in evaluation; never bootstrap AppModule or connect databases.
async function main() {
  const [selection, readings]: unknown[] = await Promise.all(
    ['tarot-selection-quality.json', 'tarot-reading-quality.json'].map(
      async (name) =>
        JSON.parse(
          await readFile(resolve(__dirname, 'fixtures', name), 'utf8'),
        ) as unknown,
    ),
  );
  const fixtures = parseEvaluationFixtures(selection, readings);
  const args = process.argv.slice(2);
  const versions = {
    selectionRuleVersion: TAROT_SELECTION_SKILL_METADATA.version,
    promptVersion: TAROT_READING_PROMPT_VERSION,
  };
  if (!args.length) {
    process.stdout.write(
      JSON.stringify({
        mode: 'dry-run',
        ...versions,
        validSelectionCases: 24,
        validReadingCases: 18,
        plannedCalls: 42,
        maxChatOutputTokens: 14400,
        externalCalls: 0,
      }) + '\n',
    );
    return;
  }
  if (args.length !== 3 || args[0] !== '--execute' || args[1] !== '--output')
    throw new Error('Invalid evaluation arguments');
  const file = await openEvaluationReport(args[2]);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  let model = '';
  let usage: unknown = null;
  const results: (EvaluationResult & { usage: unknown })[] = [];
  const checkpoint = async () => {
    const body = JSON.stringify(
      {
        ...versions,
        model,
        ...summarizeEvaluation(results, controller.signal.aborted),
        maxChatOutputTokens: 14400,
        reviewStatus: 'pending-human-review',
        results,
      },
      null,
      2,
    );
    await file.truncate(0);
    await file.write(Buffer.from(body), 0, undefined, 0);
  };
  const usageSchema = z.object({
    input_tokens: z.number().finite().nonnegative(),
    output_tokens: z.number().finite().nonnegative(),
    total_tokens: z.number().finite().nonnegative().optional(),
  });
  Logger.overrideLogger({
    log(message: unknown) {
      if (typeof message !== 'string') return;
      try {
        const event = z
          .object({
            stage: z.enum(['reading', 'classification']),
            tokens: usageSchema,
          })
          .safeParse(JSON.parse(message) as unknown);
        if (event.success) usage = event.data.tokens;
      } catch {
        /* Ignore everything outside numeric usage contract. */
      }
    },
    error() {},
    warn() {},
  });
  try {
    loadEnvironment({ path: resolve(__dirname, '../.env'), quiet: true });
    const settings = configuration();
    for (const key of [settings.openai.apiKey, settings.tarot.apiKey])
      if (!key?.trim() || /^(replace|your[-_]|placeholder|changeme)/i.test(key))
        throw new Error('Evaluation credentials are not configured');
    if (
      !Number.isFinite(settings.openai.requestTimeoutMs) ||
      settings.openai.requestTimeoutMs <= 0
    )
      throw new Error('Invalid timeout');
    model = /^[\w./:-]{1,128}$/.test(settings.openai.chatModel)
      ? settings.openai.chatModel
      : 'configured-chat-model';
    const provider = new TarotProviderService(new ConfigService(settings));
    const measured: Pick<TarotProviderService, 'classify' | 'read'> = {
      classify: async (question, signal) => {
        usage = null;
        return provider.classify(question, signal);
      },
      read: async function* (input, signal) {
        usage = null;
        yield* provider.read(input, signal);
      },
    };
    await checkpoint();
    const summary = await runTarotEvaluation(
      fixtures,
      measured,
      controller.signal,
      async (result) => {
        results.push({ ...result, usage });
        await checkpoint();
        process.stdout.write(
          JSON.stringify({
            phase: result.phase,
            caseId: result.caseId,
            status: result.status,
            attemptedCalls: results.length,
          }) + '\n',
        );
      },
    );
    if (
      summary.selection.completed !== 24 ||
      summary.reading.completed !== 18 ||
      summary.cancelled
    )
      process.exitCode = 1;
  } finally {
    try {
      await checkpoint();
    } finally {
      await file.close();
      process.removeListener('SIGINT', cancel);
      process.removeListener('SIGTERM', cancel);
      Logger.overrideLogger(false);
    }
  }
}
void main().catch(() => {
  process.stderr.write(
    'Tarot evaluation stopped. Check configuration or report destination; no raw error is printed.\n',
  );
  process.exitCode = 1;
});
