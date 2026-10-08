import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';
import {
  evaluateDeepReadingCase,
  summarizeDeepReadingRows,
} from './deep-reading-evaluation';

export const fixtureSchema = z.object({
  version: z.literal('synthetic-deep-reading-v1'),
  license: z.string(),
  reviewStatus: z.literal('human-review-pending'),
  books: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      chunks: z.array(
        z.object({
          id: z.string(),
          sectionOrder: z.number().int().positive(),
          text: z.string(),
        }),
      ),
    }),
  ),
  cases: z.array(
    z.object({
      id: z.string(),
      bookId: z.string(),
      category: z.enum([
        'simple',
        'complex',
        'follow_up',
        'missing',
        'injection',
      ]),
      split: z.enum(['development', 'acceptance']),
      question: z.string(),
      history: z.array(
        z.object({ role: z.enum(['user', 'assistant']), content: z.string() }),
      ),
      ceiling: z.number().int().positive(),
      evidenceGroups: z.array(z.array(z.string()).min(1)),
      expectedFacts: z.array(z.string()),
      forbiddenFacts: z.array(z.string()),
    }),
  ),
});
export function runOffline(path: string): void {
  const raw = readFileSync(path, 'utf8');
  const fixtures = fixtureSchema.parse(JSON.parse(raw) as unknown);
  if (
    fixtures.cases.length !== 120 ||
    fixtures.cases.filter((item) => item.split === 'acceptance').length !== 80
  )
    throw new Error('Fixture split is not frozen at 40/80');
  const rows = fixtures.cases.map((item) => {
    const book = fixtures.books.find((book) => book.id === item.bookId);
    if (!book) throw new Error('Unknown fixture book');
    for (const group of item.evidenceGroups)
      for (const id of group)
        if (
          !book.chunks.some(
            (chunk) => chunk.id === id && chunk.sectionOrder <= item.ceiling,
          )
        )
          throw new Error('Fixture evidence crosses visibility boundary');
    // This validates scoring algebra, not a simulated claim of agent quality.
    return evaluateDeepReadingCase(item, {
      chunkIds: item.evidenceGroups.map((group) => group[0]),
      answer: item.expectedFacts.join(' '),
      baseline: 'SCORING_SELF_CHECK',
      run: 1,
    });
  });
  const summary = summarizeDeepReadingRows(rows);
  if (summary.completeEvidenceRate !== 1 || summary.securityViolations)
    throw new Error('Scoring self-check failed');
  process.stdout.write(
    JSON.stringify(
      {
        fixtureHash: createHash('sha256').update(raw).digest('hex'),
        caseCount: fixtures.cases.length,
        developmentCount: 40,
        acceptanceCount: 80,
        summary,
        notice:
          'Scoring self-check only; no provider, database, retrieval, or live quality evaluation was performed.',
      },
      null,
      2,
    ) + '\n',
  );
}
if (require.main === module) {
  try {
    const index = process.argv.indexOf('--fixtures');
    runOffline(
      resolve(
        index < 0
          ? 'test/fixtures/deep-reading-mode.json'
          : process.argv[index + 1],
      ),
    );
  } catch {
    process.stderr.write(
      'Offline fixture validation failed; no external calls were made.\n',
    );
    process.exitCode = 1;
  }
}
