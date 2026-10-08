import {
  validateAgenticSmoke,
  agenticSmokeSchema,
  calculateAgenticBudget,
} from '../../test/agentic-reading-smoke';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
describe('agentic smoke contracts', () => {
  const load = () =>
    JSON.parse(
      readFileSync(
        resolve(__dirname, '../../test/fixtures/agentic-reading-smoke.json'),
        'utf8',
      ),
    ) as unknown;
  it('requires visible evidence and explicit tool permissions', () => {
    const fixture = agenticSmokeSchema.parse(load());
    expect(validateAgenticSmoke(fixture).cases).toHaveLength(24);
    const unknown = structuredClone(fixture);
    unknown.cases[0].evidenceGroups = [['foreign']];
    expect(() => validateAgenticSmoke(unknown)).toThrow();
    const future = structuredClone(fixture);
    future.cases[0].ceiling = 0;
    expect(() => validateAgenticSmoke(future)).toThrow();
    const permission = structuredClone(fixture);
    permission.cases.find((c) => c.category === 'external')!.allowedTools = [];
    expect(() => validateAgenticSmoke(permission)).toThrow();
  });
  it('computes selected suite budgets before writes', () => {
    expect(calculateAgenticBudget(24, 1, 2, 3)).toEqual({
      requests: 109,
      chatCalls: 240,
      embeddingTexts: 504,
    });
    expect(() => calculateAgenticBudget(24, 0, 2, 3)).toThrow();
  });
  it('budgets a native retrieval request and a grounded answer for simple facts', () => {
    const fixture = agenticSmokeSchema.parse(load());
    expect(
      fixture.cases
        .filter((item) => item.category === 'simple')
        .map((item) => item.maxModelCalls),
    ).toEqual(Array(8).fill(2));
  });
});
