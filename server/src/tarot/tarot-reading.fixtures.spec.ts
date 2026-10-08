import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { buildTarotReadingMessages } from './tarot-reading.prompt';

const fixtureSchema = z.array(
  z
    .object({
      id: z.string().min(1),
      question: z
        .string()
        .min(1)
        .refine((value) => Array.from(value).length <= 300),
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
      review: z.array(z.string().min(1)).min(1),
    })
    .strict(),
);

it('has eighteen valid synthetic readings covering three spreads', () => {
  const input: unknown = JSON.parse(
    readFileSync(
      resolve(__dirname, '../../test/fixtures/tarot-reading-quality.json'),
      'utf8',
    ),
  );
  const fixtures = fixtureSchema.parse(input);
  expect(fixtures).toHaveLength(18);
  expect(new Set(fixtures.map((fixture) => fixture.id)).size).toBe(18);
  expect(fixtures.filter((f) => f.spread === 'triangle')).toHaveLength(6);
  expect(
    fixtures.filter((fixture) => fixture.spread === 'yes_no'),
  ).toHaveLength(6);
  expect(
    fixtures.filter((fixture) => fixture.spread === 'three_card'),
  ).toHaveLength(6);
  for (const fixture of fixtures)
    expect(() => buildTarotReadingMessages(fixture)).not.toThrow();
  const screenshot = fixtures.find(
    (fixture) => fixture.id === 'triple-screenshot',
  )!;
  const data = JSON.parse(buildTarotReadingMessages(screenshot)[1].content) as {
    cards: { name: string; reversed: boolean }[];
  };
  expect(data.cards.map((card) => [card.name, card.reversed])).toEqual([
    ['圣杯侍从', false],
    ['月亮', true],
    ['圣杯六', false],
  ]);
});
