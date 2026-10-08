import { z } from 'zod';
import { fixtureSchema } from './run-deep-reading-offline';
const toolName = z.enum([
  'book_search',
  'memory_recall',
  'request_external_research',
  'prepare_email',
]);
export const agenticSmokeSchema = fixtureSchema.extend({
  version: z.literal('synthetic-agentic-reading-v1'),
  cases: z.array(
    z.object({
      id: z.string(),
      bookId: z.string(),
      category: z.enum([
        'simple',
        'complex',
        'follow_up',
        'memory',
        'external',
        'email',
        'missing',
      ]),
      split: z.literal('acceptance'),
      question: z.string(),
      history: z.array(
        z.object({ role: z.enum(['user', 'assistant']), content: z.string() }),
      ),
      ceiling: z.number().int().positive(),
      evidenceGroups: z.array(z.array(z.string()).min(1)),
      expectedFacts: z.array(z.string()),
      forbiddenFacts: z.array(z.string()),
      expectedToolNames: z.array(toolName),
      allowedTools: z.array(toolName),
      maxModelCalls: z.number().int().min(1).max(4),
      memorySeed: z.string().optional(),
      expectMemoryUpdate: z.boolean().optional(),
    }),
  ),
});
export function validateAgenticSmoke(
  input: unknown,
): z.infer<typeof agenticSmokeSchema> {
  const data = agenticSmokeSchema.parse(input);
  const counts = {
    simple: 8,
    complex: 4,
    follow_up: 3,
    memory: 3,
    external: 2,
    email: 2,
    missing: 2,
  };
  if (
    data.cases.length !== 24 ||
    new Set(data.cases.map((c) => c.id)).size !== 24
  )
    throw new Error('Smoke case IDs/count invalid');
  for (const [category, count] of Object.entries(counts))
    if (data.cases.filter((c) => c.category === category).length !== count)
      throw new Error('Smoke category split invalid');
  for (const item of data.cases) {
    const book = data.books.find((b) => b.id === item.bookId);
    if (!book) throw new Error('Unknown fixture book');
    for (const group of item.evidenceGroups)
      for (const id of group)
        if (
          !book.chunks.some(
            (c) => c.id === id && c.sectionOrder <= item.ceiling,
          )
        )
          throw new Error('Evidence outside visible fixture');
    if (item.expectedToolNames.some((t) => !item.allowedTools.includes(t)))
      throw new Error('Expected tool lacks explicit permission');
    if (
      item.category === 'external' &&
      !item.allowedTools.includes('request_external_research')
    )
      throw new Error('External permission missing');
    if (
      item.category === 'email' &&
      !item.allowedTools.includes('prepare_email')
    )
      throw new Error('Email intent permission missing');
  }
  return data;
}
// Deterministic HTTP ceiling and conservative transport ceilings, not predicted
// usage: Q allows SDK retry, D1 has no retries. Prepared book ingestion excluded.
export function calculateAgenticBudget(
  cases: number,
  repeats: number,
  onlineBaselines: number,
  books: number,
): { requests: number; chatCalls: number; embeddingTexts: number } {
  if (
    ![cases, repeats, books].every((n) => Number.isInteger(n) && n > 0) ||
    onlineBaselines !== 2 ||
    repeats > 3
  )
    throw new Error('Invalid evaluation selection');
  return {
    requests: 1 + 4 * books + cases * repeats * onlineBaselines * 2,
    chatCalls: cases * repeats * 10,
    embeddingTexts: cases * repeats * 21,
  };
}
