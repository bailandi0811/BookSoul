import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadTarotSelectionSkill } from '../agent-skills/tarot-agent-skills';
import { buildTarotSelectionQuestion } from './tarot-selection.rules';

const cases = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../test/fixtures/tarot-selection-scale.json'),
    'utf8',
  ),
) as Array<{
  id: string;
  question: string;
  expectedSpread: string;
  slice: string;
  review: string[];
}>;
const normalize = (value: string) =>
  value.replace(/[？?\s，,。.!！：:；;]/g, '').toLowerCase();

it('builds one thousand held-out selection cases with the production question', () => {
  expect(loadTarotSelectionSkill().content).toEqual(
    buildTarotSelectionQuestion(),
  );
  expect(cases).toHaveLength(1000);
  expect(new Set(cases.map((item) => item.id)).size).toBe(1000);
  expect(new Set(cases.map((item) => normalize(item.question))).size).toBe(
    1000,
  );
  const count = (spread: string, slice?: string) =>
    cases.filter(
      (item) =>
        item.expectedSpread === spread &&
        (slice === undefined || item.slice === slice),
    ).length;
  expect(count('yes_no')).toBe(300);
  expect(count('yes_no', 'colloquial')).toBe(80);
  expect(count('yes_no', 'time-bounded')).toBe(70);
  expect(count('three_card')).toBe(280);
  expect(count('triangle')).toBe(280);
  expect(count('unclear')).toBe(140);
  expect(count('unclear', 'injection')).toBe(30);
  expect(count('unclear', 'multi')).toBe(50);
  const reserved = new Set(
    [
      ...buildTarotSelectionQuestion().instructions.examples.map(
        (item) => item.question,
      ),
      ...[
        'tarot-selection-quality.json',
        'tarot-selection-natural-questions.json',
      ].flatMap((name) =>
        (
          JSON.parse(
            readFileSync(
              resolve(__dirname, '../../test/fixtures', name),
              'utf8',
            ),
          ) as Array<{ question: string }>
        ).map((item) => item.question),
      ),
    ].map(normalize),
  );
  for (const item of cases) {
    expect(item.id).toMatch(/^scale-(yes|three|tri|unclear)-\d{3}$/);
    expect(item.review.length).toBeGreaterThan(0);
    expect([...item.question].length).toBeLessThanOrEqual(300);
    expect(reserved.has(normalize(item.question))).toBe(false);
  }
  const forbidden = {
    yes_no: /为什么|怎么办|阻碍|什么时候|多久|问题在哪|怎样才能|怎么做才能/,
    three_card: /为什么|怎么办|阻碍|问题在哪|怎样才能|怎么做才能/,
  };
  for (const [spread, pattern] of Object.entries(forbidden))
    for (const item of cases.filter((entry) => entry.expectedSpread === spread))
      expect(item.question).not.toMatch(pattern);
});
