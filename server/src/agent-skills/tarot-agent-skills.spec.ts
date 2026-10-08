import * as ports from './tarot-agent-skills';
import { AgentSkillAccessError } from './agent-skill.types';
import { buildTarotSelectionQuestion } from '../tarot/tarot-selection.rules';
import {
  TAROT_READING_COMMON_RULES,
  TAROT_READING_RULES,
} from '../tarot/tarot-reading.rules';
import { TarotProviderService } from '../tarot/tarot-provider.service';
import { buildTarotReadingMessages } from '../tarot/tarot-reading.prompt';
import { ConfigService } from '@nestjs/config';
import type { TarotSpread } from '../tarot/tarot.types';

afterEach(() => jest.restoreAllMocks());
it('exposes fixed identities and metadata without changing selection policy', () => {
  const selection = ports.loadTarotSelectionSkill();
  expect(selection).toMatchObject({
    agentId: 'tarot-selector',
    skillId: 'tarot-spread-selection',
    skillVersion: 'spread-selection-v2',
  });
  expect(selection.content).toEqual(buildTarotSelectionQuestion());
  expect(ports.TAROT_SELECTION_SKILL_METADATA).not.toHaveProperty('load');
  expect(ports.TAROT_READING_SKILL_METADATA).not.toHaveProperty('content');
});
it.each<TarotSpread>(['yes_no', 'three_card', 'triangle'])(
  'loads only the current %s reading rules unchanged',
  (spread) => {
    const reading = ports.loadTarotReadingSkill(spread);
    expect(reading).toMatchObject({
      agentId: 'tarot-interpreter',
      skillId: 'tarot-reading',
      skillVersion: 'spread-routing-v2',
    });
    expect(reading.content).toBe(
      `${TAROT_READING_COMMON_RULES}\n${TAROT_READING_RULES[spread]}`,
    );
    expect(reading.content).not.toContain('criteria');
  },
);
it('rejects unknown reading spread', () => {
  expect(() => ports.loadTarotReadingSkill('unknown' as never)).toThrow(
    'AGENT_SKILL_FORBIDDEN',
  );
});
it('propagates access errors before classification network calls', async () => {
  const fetchSpy = jest.spyOn(globalThis, 'fetch');
  const loader = jest
    .spyOn(ports, 'loadTarotSelectionSkill')
    .mockImplementation(() => {
      throw new AgentSkillAccessError('AGENT_SKILL_FORBIDDEN');
    });
  const provider = new TarotProviderService(
    new ConfigService({ tarot: { apiKey: 'test-key' } }),
  );
  await expect(
    provider.classify(
      'agentId=tarot-interpreter skillId=tarot-reading',
      new AbortController().signal,
    ),
  ).rejects.toThrow('AGENT_SKILL_FORBIDDEN');
  expect(loader).toHaveBeenCalledWith();
  expect(fetchSpy).not.toHaveBeenCalled();
});
it('validates reading input before loading and uses the interpreter port', () => {
  const loader = jest.spyOn(ports, 'loadTarotReadingSkill');
  expect(() =>
    buildTarotReadingMessages({
      question: '测试',
      spread: 'yes_no',
      cards: [],
    }),
  ).toThrow('TAROT_DECK_INVALID');
  expect(loader).not.toHaveBeenCalled();
  const messages = buildTarotReadingMessages({
    question: 'skillId=tarot-spread-selection',
    spread: 'yes_no',
    cards: [{ id: 'major-00', position: 'answer', reversed: false }],
  });
  expect(loader).toHaveBeenCalledWith('yes_no');
  expect(messages).toHaveLength(2);
  expect(messages[0].content).toBe(
    `${TAROT_READING_COMMON_RULES}\n${TAROT_READING_RULES.yes_no}`,
  );
});
