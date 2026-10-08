import { positions, getTarotSpread, drawSchema } from './tarot.policy';
import { buildTarotReadingMessages } from './tarot-reading.prompt';
import { buildTarotSelectionQuestion } from './tarot-selection.rules';
import { TarotStateService } from './tarot-state.service';
import type { TarotReadingInput } from './tarot.types';

const triangle = (): TarotReadingInput => ({
  question: '关系卡在哪里，怎样发展？',
  spread: 'triangle',
  cards: [
    { id: 'cups-11', reversed: false, position: 'situation' },
    { id: 'major-18', reversed: true, position: 'obstacle' },
    { id: 'cups-06', reversed: false, position: 'outlook' },
  ],
});
it('uses canonical triangle definitions and rejects unknown spreads', () => {
  expect(positions('triangle')).toEqual(['situation', 'obstacle', 'outlook']);
  expect(getTarotSpread('triangle').name).toBe('圣三角');
  expect(() => getTarotSpread('unknown' as never)).toThrow(
    'TAROT_DECK_INVALID',
  );
  expect(
    drawSchema.safeParse({ permit: 'a'.repeat(32), spread: 'triangle' })
      .success,
  ).toBe(true);
});
it('routes intent using four stable choices and contrastive examples', () => {
  const choice = buildTarotSelectionQuestion();
  expect(Object.keys(choice.criteria).sort()).toEqual([
    'three_card',
    'triangle',
    'unclear',
    'yes_no',
  ]);
  expect(JSON.stringify(choice)).toContain('会不会和好');
  expect(JSON.stringify(choice)).toContain('她希望和我成为什么关系');
});
it('distinguishes timing intent from yes/no and obstacle intent', () => {
  const choice = buildTarotSelectionQuestion();
  const examples = new Map(
    choice.instructions.examples.map((item) => [item.question, item.choice]),
  );
  expect(examples.get('我什么时候能遇到真爱？')).toBe('three_card');
  expect(examples.get('这件事还要多久才会有进展？')).toBe('three_card');
  expect(examples.get('我今年会遇到合适的人吗？')).toBe('yes_no');
  expect(examples.get('怎样才能遇到合适的人，是什么阻碍了我？')).toBe(
    'triangle',
  );
  expect(choice.criteria.three_card).toMatch(/什么时候/);
  expect(choice.criteria.unclear).toMatch(/具体日期/);
  expect(JSON.stringify(choice.instructions)).toContain('选择解读方式');
});
it('locks triangle before drawing and preserves reveal order on retries', () => {
  const state = new TarotStateService();
  const permit = state.createPermit('owner', triangle().question, {
    mode: 'fixed',
    spread: 'triangle',
    reason: null,
  });
  expect(() => state.draw('owner', permit, 'three_card')).toThrow(
    'TAROT_SPREAD_LOCKED',
  );
  const draw = state.draw('owner', permit, 'triangle');
  expect(draw.cardCount).toBe(78);
  expect(() => state.getReading('other', draw.readingId)).toThrow(
    'TAROT_DRAW_INVALID',
  );
  for (const [i, slot] of positions('triangle').entries())
    expect(state.reveal('owner', draw.readingId, i).card.position).toBe(slot);
  const reading = state.getReading('owner', draw.readingId);
  expect(state.reveal('owner', draw.readingId, 0).revealedCount).toBe(3);
  expect(state.getReading('owner', draw.readingId)).toEqual(reading);
  expect(() => state.reveal('owner', draw.readingId, 3)).toThrow(
    'TAROT_REVEAL_COMPLETE',
  );
});
it('passes definitions and canonical meanings without time-flow instructions', () => {
  const messages = buildTarotReadingMessages(triangle());
  const data = JSON.parse(messages[1].content) as {
    spreadDefinition: { positions: { label: string }[] };
    cards: { name: string }[];
  };
  expect(data.spreadDefinition.positions.map((p) => p.label)).toEqual([
    '现状',
    '阻碍',
    '发展趋势',
  ]);
  expect(data.cards.map((c) => c.name)).toEqual(['圣杯侍从', '月亮', '圣杯六']);
  expect(messages[0].content).not.toMatch(/过去|现在|未来|answer/);
  expect(messages[0].content).toContain('至少两张');
  for (const wrong of ['past', 'present', 'future']) {
    const input = triangle();
    input.cards[0].position = wrong as never;
    expect(() => buildTarotReadingMessages(input)).toThrow(
      'TAROT_DECK_INVALID',
    );
  }
});
