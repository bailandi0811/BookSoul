import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { config as loadEnvironment } from 'dotenv';
import { z } from 'zod';
import configuration from '../src/config/configuration';
import {
  buildTarotSelectionQuestion,
  TAROT_SELECTION_RULE_VERSION,
} from '../src/tarot/tarot-selection.rules';
import { openEvaluationReport } from './tarot-evaluation';

const caseSchema = z
  .object({
    id: z.string().regex(/^scale-(yes|three|tri|unclear)-\d{3}$/),
    question: z
      .string()
      .trim()
      .min(1)
      .refine((value) => Array.from(value).length <= 300),
    expectedSpread: z.enum(['yes_no', 'three_card', 'triangle', 'unclear']),
    slice: z.string().regex(/^[a-z-]+$/),
    review: z.array(z.string().min(1)).min(1),
  })
  .strict();
const probability = z.number().finite().min(0).max(1);
const responseSchema = z.object({
  model: z.string(),
  usage: z
    .object({
      input_tokens: z.number().finite().nonnegative(),
      output_tokens: z.number().finite().nonnegative(),
    })
    .optional(),
  answers: z.object({
    spread: z.object({
      type: z.literal('choice'),
      choice: z.enum(['yes_no', 'three_card', 'triangle', 'unclear']),
      confidence: probability,
      probabilities: z
        .object({
          yes_no: probability,
          three_card: probability,
          triangle: probability,
          unclear: probability,
        })
        .strict()
        .refine(
          (value) =>
            Math.abs(
              value.yes_no +
                value.three_card +
                value.triangle +
                value.unclear -
                1,
            ) <= 0.001,
        ),
    }),
  }),
});
type ScaleCase = z.infer<typeof caseSchema>;
type ScaleResult = {
  id: string;
  slice: string;
  expectedSpread: ScaleCase['expectedSpread'];
  choice: ScaleCase['expectedSpread'] | null;
  confidence: number | null;
  auto: boolean;
  rawCorrect: boolean;
  durationMs: number;
  status: 'completed' | 'failed';
  httpStatus?: number;
};

function deadline(signal: AbortSignal, milliseconds: number) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error('Tarot request timed out')),
    milliseconds,
  );
  return {
    signal: AbortSignal.any([signal, controller.signal]),
    dispose: () => clearTimeout(timer),
  };
}
function rate(correct: number, total: number) {
  return total === 0 ? null : Number((correct / total).toFixed(4));
}
function summarize(results: ScaleResult[]) {
  const done = results.filter((item) => item.status === 'completed');
  const bucket = (items: ScaleResult[]) => {
    const completed = items.filter((item) => item.status === 'completed');
    const locked = completed.filter((item) => item.auto);
    const clear = completed.filter((item) => item.expectedSpread !== 'unclear');
    const clearLocked = clear.filter((item) => item.auto);
    return {
      planned: items.length,
      completed: completed.length,
      rawCorrect: completed.filter((item) => item.rawCorrect).length,
      rawAccuracy: rate(
        completed.filter((item) => item.rawCorrect).length,
        completed.length,
      ),
      autoLocked: locked.length,
      autoCorrect: locked.filter((item) => item.choice === item.expectedSpread)
        .length,
      autoWrong: locked.filter((item) => item.choice !== item.expectedSpread)
        .length,
      clearCount: clear.length,
      clearAutoLocked: clearLocked.length,
      clearAutoCorrect: clearLocked.filter(
        (item) => item.choice === item.expectedSpread,
      ).length,
    };
  };
  const by = (key: 'expectedSpread' | 'slice') => {
    const names = [...new Set(results.map((item) => item[key]))];
    return Object.fromEntries(
      names.map((name) => [
        name,
        bucket(results.filter((item) => item[key] === name)),
      ]),
    );
  };
  return {
    ...bucket(done.length === results.length ? results : done),
    bySpread: by('expectedSpread'),
    bySlice: by('slice'),
  };
}
async function loadCases() {
  const parsed: unknown = JSON.parse(
    await readFile(
      resolve(__dirname, 'fixtures/tarot-selection-scale.json'),
      'utf8',
    ),
  );
  const cases = z.array(caseSchema).length(1000).parse(parsed);
  if (new Set(cases.map((item) => item.id)).size !== cases.length)
    throw new Error('Duplicate case IDs');
  if (new Set(cases.map((item) => item.question)).size !== cases.length)
    throw new Error('Duplicate questions');
  return cases;
}
async function main() {
  const cases = await loadCases();
  const body = JSON.stringify({
    model: 'jev-latest',
    state: cases[0].question,
    questions: { spread: buildTarotSelectionQuestion() },
  });
  const args = process.argv.slice(2);
  if (!args.length) {
    process.stdout.write(
      JSON.stringify({
        mode: 'dry-run',
        selectionRuleVersion: TAROT_SELECTION_RULE_VERSION,
        validCases: cases.length,
        plannedCalls: cases.length,
        readingCalls: 0,
        externalCalls: 0,
        sampleRequestBytes: Buffer.byteLength(body),
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
  const results: ScaleResult[] = [];
  let model = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let stopped: { caseId: string; httpStatus: number | null } | null = null;
  const checkpoint = async () => {
    const report = JSON.stringify(
      {
        selectionRuleVersion: TAROT_SELECTION_RULE_VERSION,
        model,
        readingCalls: 0,
        inputTokens,
        outputTokens,
        stopped,
        ...summarize(results),
        results,
      },
      null,
      2,
    );
    await file.truncate(0);
    await file.write(Buffer.from(report), 0, undefined, 0);
  };
  try {
    loadEnvironment({ path: resolve(__dirname, '../.env'), quiet: true });
    const settings = configuration();
    const config = new ConfigService(settings);
    const key = config.get<string>('tarot.apiKey')?.trim();
    if (!key || /^(replace|your[-_]|placeholder|changeme)/i.test(key))
      throw new Error('Evaluation credentials are not configured');
    const base =
      config.get<string>('tarot.baseUrl') || 'https://api.typesafe.ai';
    const path = config.get<string>('tarot.apiPath') || '/v1/systemone';
    model = config.get<string>('tarot.model') || 'jev-latest';
    const url = `${base.replace(/\/$/, '')}${path}`;
    const question = buildTarotSelectionQuestion();
    await checkpoint();
    for (const item of cases) {
      if (controller.signal.aborted) break;
      const started = Date.now();
      const call = deadline(controller.signal, 5000);
      let result: ScaleResult;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          signal: call.signal,
          body: JSON.stringify({
            model,
            state: item.question,
            questions: { spread: question },
          }),
        });
        if (!response.ok) {
          stopped = { caseId: item.id, httpStatus: response.status };
          result = {
            id: item.id,
            slice: item.slice,
            expectedSpread: item.expectedSpread,
            choice: null,
            confidence: null,
            auto: false,
            rawCorrect: false,
            durationMs: Date.now() - started,
            status: 'failed',
            httpStatus: response.status,
          };
        } else {
          const payload: unknown = await response.json();
          const parsed = responseSchema.safeParse(payload);
          if (!parsed.success) {
            stopped = { caseId: item.id, httpStatus: response.status };
            result = {
              id: item.id,
              slice: item.slice,
              expectedSpread: item.expectedSpread,
              choice: null,
              confidence: null,
              auto: false,
              rawCorrect: false,
              durationMs: Date.now() - started,
              status: 'failed',
              httpStatus: response.status,
            };
          } else {
            const answer = parsed.data.answers.spread;
            if (parsed.data.usage) {
              inputTokens += parsed.data.usage.input_tokens;
              outputTokens += parsed.data.usage.output_tokens;
            }
            model = parsed.data.model;
            const auto =
              answer.choice !== 'unclear' && answer.confidence >= 0.8;
            result = {
              id: item.id,
              slice: item.slice,
              expectedSpread: item.expectedSpread,
              choice: answer.choice,
              confidence: answer.confidence,
              auto,
              rawCorrect: answer.choice === item.expectedSpread,
              durationMs: Date.now() - started,
              status: 'completed',
            };
          }
        }
      } catch {
        stopped = { caseId: item.id, httpStatus: null };
        result = {
          id: item.id,
          slice: item.slice,
          expectedSpread: item.expectedSpread,
          choice: null,
          confidence: null,
          auto: false,
          rawCorrect: false,
          durationMs: Date.now() - started,
          status: controller.signal.aborted ? 'failed' : 'failed',
          httpStatus: undefined,
        };
      } finally {
        call.dispose();
      }
      results.push(result);
      await checkpoint();
      process.stdout.write(
        JSON.stringify({
          id: result.id,
          status: result.status,
          expected: result.expectedSpread,
          choice: result.choice,
          confidence: result.confidence,
          completed: results.filter((entry) => entry.status === 'completed')
            .length,
        }) + '\n',
      );
      if (result.status !== 'completed') break;
    }
    if (results.length !== cases.length || stopped) process.exitCode = 1;
  } finally {
    try {
      await checkpoint();
    } finally {
      await file.close();
      process.removeListener('SIGINT', cancel);
      process.removeListener('SIGTERM', cancel);
    }
  }
}
void main().catch(() => {
  process.stderr.write(
    'Selection scale evaluation stopped. Check configuration or report destination; no raw error is printed.\n',
  );
  process.exitCode = 1;
});
