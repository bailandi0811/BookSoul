import { open, realpath } from 'node:fs/promises';
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';
import { z } from 'zod';
import { TAROT_SPREADS } from '../src/tarot/tarot-spreads.generated';
import { buildTarotReadingMessages } from '../src/tarot/tarot-reading.prompt';
import type { TarotClassification } from '../src/tarot/tarot.types';
import type { TarotProviderService } from '../src/tarot/tarot-provider.service';

const question = z
  .string()
  .trim()
  .min(1)
  .refine((s) => Array.from(s).length <= 300);
const base = {
  id: z.string().regex(/^[a-z0-9-]+$/),
  question,
  review: z.array(z.string().min(1)).min(1),
};
const selectionSchema = z.array(
  z
    .object({
      ...base,
      expectedSpread: z.enum(['yes_no', 'three_card', 'triangle', 'unclear']),
    })
    .strict(),
);
const readingsSchema = z.array(
  z
    .object({
      ...base,
      spread: z.enum(['yes_no', 'three_card', 'triangle']),
      cards: z.array(
        z
          .object({
            id: z.string(),
            reversed: z.boolean(),
            position: z.enum([
              'answer',
              'past',
              'present',
              'future',
              'situation',
              'obstacle',
              'outlook',
            ]),
          })
          .strict(),
      ),
    })
    .strict(),
);
export type EvaluationFixtures = {
  selection: z.infer<typeof selectionSchema>;
  readings: z.infer<typeof readingsSchema>;
};
export type EvaluationResult = {
  phase: 'selection' | 'reading';
  caseId: string;
  status: 'completed' | 'failed' | 'cancelled';
  durationMs: number;
  classification?: TarotClassification;
  expectedSpread?: string;
  content?: string;
  errorCode?: string;
  review: string[];
};
export function parseEvaluationFixtures(
  selection: unknown,
  readings: unknown,
): EvaluationFixtures {
  const fixtures = {
    selection: selectionSchema.parse(selection),
    readings: readingsSchema.parse(readings),
  };
  if (fixtures.selection.length !== 24 || fixtures.readings.length !== 18)
    throw new Error('Invalid case counts');
  for (const group of [fixtures.selection, fixtures.readings])
    if (new Set(group.map((c) => c.id)).size !== group.length)
      throw new Error('Duplicate case IDs');
  for (const id of [...TAROT_SPREADS.map((d) => d.id), 'unclear'])
    if (fixtures.selection.filter((c) => c.expectedSpread === id).length !== 6)
      throw new Error('Invalid selection coverage');
  for (const d of TAROT_SPREADS)
    if (fixtures.readings.filter((c) => c.spread === d.id).length !== 6)
      throw new Error('Invalid reading coverage');
  for (const item of fixtures.readings) buildTarotReadingMessages(item);
  return fixtures;
}
export async function openEvaluationReport(target: string) {
  const requested = resolve(target);
  const canonical = resolve(
    await realpath(dirname(requested)),
    basename(requested),
  );
  const fromRepo = relative(
    await realpath(resolve(__dirname, '../..')),
    canonical,
  );
  if (
    fromRepo !== '..' &&
    !fromRepo.startsWith(`..${sep}`) &&
    !isAbsolute(fromRepo)
  )
    throw new Error('Report must be outside repository');
  return open(canonical, 'wx', 0o600);
}
export function summarizeEvaluation(
  results: EvaluationResult[],
  cancelled: boolean,
) {
  const count = (phase: EvaluationResult['phase'], planned: number) => {
    const group = results.filter((r) => r.phase === phase);
    return {
      planned,
      attempted: group.length,
      completed: group.filter((r) => r.status === 'completed').length,
      unattempted: planned - group.length,
    };
  };
  return {
    selection: count('selection', 24),
    reading: count('reading', 18),
    cancelled,
  };
}
export type EvaluationSummary = ReturnType<typeof summarizeEvaluation>;
export async function runTarotEvaluation(
  fixtures: EvaluationFixtures,
  provider: Pick<TarotProviderService, 'classify' | 'read'>,
  signal: AbortSignal,
  onResult: (result: EvaluationResult) => Promise<void>,
): Promise<EvaluationSummary> {
  // Revalidate all synthetic inputs before the first potentially paid operation.
  const validated = parseEvaluationFixtures(
    fixtures.selection,
    fixtures.readings,
  );
  const results: EvaluationResult[] = [];
  for (const phase of ['selection', 'reading'] as const) {
    const items =
      phase === 'selection' ? validated.selection : validated.readings;
    for (const item of items) {
      if (signal.aborted) return summarizeEvaluation(results, true);
      const started = Date.now();
      let result: EvaluationResult;
      try {
        if ('expectedSpread' in item) {
          const classification = await provider.classify(item.question, signal);
          signal.throwIfAborted();
          if (classification.reason === 'unavailable')
            throw new Error('Unavailable');
          result = {
            phase,
            caseId: item.id,
            status: 'completed',
            durationMs: Date.now() - started,
            classification,
            expectedSpread: item.expectedSpread,
            review: item.review,
          };
        } else {
          let content = '';
          for await (const chunk of provider.read(item, signal)) {
            signal.throwIfAborted();
            content += chunk;
          }
          signal.throwIfAborted();
          if (!content.trim()) throw new Error('Empty reading');
          result = {
            phase,
            caseId: item.id,
            status: 'completed',
            durationMs: Date.now() - started,
            content,
            review: item.review,
          };
        }
      } catch {
        result = {
          phase,
          caseId: item.id,
          status: signal.aborted ? 'cancelled' : 'failed',
          durationMs: Date.now() - started,
          errorCode: 'TAROT_EVAL_INCOMPLETE',
          review: item.review,
        };
      }
      results.push(result);
      await onResult(result);
      if (result.status !== 'completed')
        return summarizeEvaluation(results, signal.aborted);
    }
  }
  return summarizeEvaluation(results, signal.aborted);
}
