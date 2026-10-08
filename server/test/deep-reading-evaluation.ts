import { z } from 'zod';

const streamEventSchema = z
  .object({
    content: z.string().optional(),
    error: z.string().optional(),
    code: z.string().optional(),
    stage: z.string().optional(),
    reason: z.string().optional(),
    externalReferences: z
      .array(
        z.object({ title: z.string(), url: z.string(), snippet: z.string() }),
      )
      .optional(),
    emailDraft: z
      .object({ to: z.string(), subject: z.string(), text: z.string() })
      .optional(),
    memoryUpdate: z
      .object({
        hasNewMemories: z.boolean(),
        memoryCount: z.number(),
        updatedCount: z.number().optional(),
      })
      .optional(),
    runSummary: z
      .object({
        toolCalls: z.number().optional(),
        modelCalls: z.number().optional(),
      })
      .passthrough()
      .optional(),
    references: z
      .array(
        z.object({
          bookId: z.string(),
          sectionOrder: z.number(),
          excerpt: z.string(),
        }),
      )
      .optional(),
  })
  .passthrough();
export function parseDeepReadingSse(text: string): {
  answer: string;
  references: Array<{ bookId: string; sectionOrder: number; excerpt: string }>;
  success: boolean;
  errorCode?: string;
  errorStage?: string;
  errorReason?: string;
  emailDraft?: { to: string; subject: string; text: string };
  memoryUpdate?: {
    hasNewMemories: boolean;
    memoryCount: number;
    updatedCount?: number;
  };
  toolCalls?: number;
  modelCalls?: number;
  externalReferences?: Array<{ title: string; url: string; snippet: string }>;
} {
  let answer = '';
  const references: Array<{
    bookId: string;
    sectionOrder: number;
    excerpt: string;
  }> = [];
  let terminals = 0;
  let errorCode: string | undefined;
  let errorStage: string | undefined, errorReason: string | undefined;
  let emailDraft: { to: string; subject: string; text: string } | undefined;
  let memoryUpdate:
    | { hasNewMemories: boolean; memoryCount: number; updatedCount?: number }
    | undefined;
  let toolCalls: number | undefined, modelCalls: number | undefined;
  let externalReferences:
    | Array<{ title: string; url: string; snippet: string }>
    | undefined;
  for (const block of text.split('\n\n')) {
    const line = block.split('\n').find((line) => line.startsWith('data: '));
    if (!line) continue;
    if (line === 'data: [DONE]') {
      terminals++;
      continue;
    }
    if (terminals) {
      errorCode = 'EVENT_AFTER_TERMINAL';
      break;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(line.slice(6)) as unknown;
    } catch {
      errorCode = 'INVALID_STREAM_EVENT';
      break;
    }
    const parsed = streamEventSchema.safeParse(raw);
    if (!parsed.success) {
      errorCode = 'INVALID_STREAM_EVENT';
      break;
    }
    if (parsed.data.error) {
      errorCode = parsed.data.code ?? 'BOOK_CHAT_UNAVAILABLE';
      errorStage = parsed.data.stage;
      errorReason = parsed.data.reason;
      continue;
    }
    answer += parsed.data.content ?? '';
    references.push(...(parsed.data.references ?? []));
    emailDraft = parsed.data.emailDraft ?? emailDraft;
    externalReferences = parsed.data.externalReferences ?? externalReferences;
    memoryUpdate = parsed.data.memoryUpdate ?? memoryUpdate;
    toolCalls = parsed.data.runSummary?.toolCalls ?? toolCalls;
    modelCalls = parsed.data.runSummary?.modelCalls ?? modelCalls;
  }
  if (!errorCode && terminals !== 1) errorCode = 'INCOMPLETE_STREAM';
  if (!errorCode && !answer.trim()) errorCode = 'EMPTY_STREAM';
  return {
    answer,
    references,
    success: !errorCode,
    ...(errorCode ? { errorCode } : {}),
    ...(errorStage ? { errorStage } : {}),
    ...(errorReason ? { errorReason } : {}),
    ...(emailDraft ? { emailDraft } : {}),
    ...(memoryUpdate ? { memoryUpdate } : {}),
    ...(toolCalls === undefined ? {} : { toolCalls }),
    ...(modelCalls === undefined ? {} : { modelCalls }),
    ...(externalReferences ? { externalReferences } : {}),
  };
}

export interface DeepReadingFixture {
  id: string;
  category: string;
  split: string;
  evidenceGroups: string[][];
  expectedFacts: string[];
  forbiddenFacts: string[];
}
export function summarizeDeepReadingBaselines(
  rows: EvaluationRow[],
): Record<string, EvaluationSummary> {
  return Object.fromEntries(
    [...new Set(rows.map((r) => r.baseline))].map((b) => [
      b,
      summarizeDeepReadingRows(rows.filter((r) => r.baseline === b)),
    ]),
  );
}
export async function readDeepReadingStream(
  response: Response,
  startedAt = Date.now(),
): Promise<{ text: string; firstContentMs: number | null }> {
  if (!response.body) throw new Error('Missing SSE body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '',
    pending = '',
    firstContentMs: number | null = null;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const part = decoder.decode(next.value, { stream: true });
      text += part;
      pending += part;
      if (text.length > 200000) throw new Error('SSE exceeds evaluation limit');
      let boundary: number;
      while ((boundary = pending.indexOf('\n\n')) >= 0) {
        const block = pending.slice(0, boundary);
        pending = pending.slice(boundary + 2);
        const line = block.split('\n').find((l) => l.startsWith('data: '));
        if (!line || line === 'data: [DONE]') continue;
        try {
          const event = streamEventSchema.safeParse(
            JSON.parse(line.slice(6)) as unknown,
          );
          if (
            event.success &&
            event.data.content?.trim() &&
            firstContentMs === null
          )
            firstContentMs = Date.now() - startedAt;
        } catch {
          /* Final parser records the malformed event. */
        }
      }
    }
    return { text, firstContentMs };
  } finally {
    reader.releaseLock();
  }
}
export interface DeepReadingReplay {
  chunkIds: string[];
  answer: string;
  run: number;
  baseline: string;
}
export interface EvaluationRow {
  id: string;
  category: string;
  split: string;
  baseline: string;
  run: number;
  evidenceCoverage: number;
  completeEvidence: boolean;
  fixtureFactMatch: number | null;
  securityViolations: number;
}
export interface EvaluationSummary {
  caseCount: number;
  completeEvidenceRate: number | null;
  securityViolations: number;
  liveQualityVerified: false;
  semanticAccuracy: null;
}
export function evaluateDeepReadingCase(
  fixture: DeepReadingFixture,
  replay: DeepReadingReplay,
): EvaluationRow {
  const hits = new Set(replay.chunkIds);
  const matched = fixture.evidenceGroups.filter((group) =>
    group.some((id) => hits.has(id)),
  ).length;
  return {
    id: fixture.id,
    category: fixture.category,
    split: fixture.split,
    baseline: replay.baseline,
    run: replay.run,
    evidenceCoverage: fixture.evidenceGroups.length
      ? matched / fixture.evidenceGroups.length
      : 1,
    completeEvidence: matched === fixture.evidenceGroups.length,
    fixtureFactMatch: fixture.expectedFacts.length
      ? fixture.expectedFacts.filter((fact) => replay.answer.includes(fact))
          .length / fixture.expectedFacts.length
      : null,
    securityViolations: fixture.forbiddenFacts.filter((fact) =>
      replay.answer.includes(fact),
    ).length,
  };
}
export function summarizeDeepReadingRows(
  rows: EvaluationRow[],
): EvaluationSummary {
  const byCase = new Map<string, EvaluationRow[]>();
  for (const row of rows) {
    const key = `${row.baseline}:${row.id}`;
    const list = byCase.get(key) ?? [];
    list.push(row);
    byCase.set(key, list);
  }
  const rates = [...byCase.values()].map(
    (items) =>
      items.filter((row) => row.completeEvidence).length / items.length,
  );
  return {
    caseCount: byCase.size,
    completeEvidenceRate: rates.length
      ? rates.reduce((sum, value) => sum + value, 0) / rates.length
      : null,
    securityViolations: rows.reduce(
      (sum, row) => sum + row.securityViolations,
      0,
    ),
    liveQualityVerified: false,
    semanticAccuracy: null,
  };
}
