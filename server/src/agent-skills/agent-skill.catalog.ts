import { createSkillAccess } from './agent-skill.access';
import {
  buildTarotSelectionQuestion,
  TAROT_SELECTION_RULE_VERSION,
} from '../tarot/tarot-selection.rules';
import {
  TAROT_READING_COMMON_RULES,
  TAROT_READING_RULES,
  TAROT_READING_RULE_VERSION,
} from '../tarot/tarot-reading.rules';

// Explicit registration does not grant access: every consumer needs a binding below.
const access = createSkillAccess(
  {
    'tarot-spread-selection': {
      id: 'tarot-spread-selection',
      version: TAROT_SELECTION_RULE_VERSION,
      description: '塔罗选阵策略',
      kind: 'choice-policy',
      load: buildTarotSelectionQuestion,
    },
    'tarot-reading': {
      id: 'tarot-reading',
      version: TAROT_READING_RULE_VERSION,
      description: '塔罗当前牌阵解读规则',
      kind: 'prompt-rules',
      load: () => ({
        common: TAROT_READING_COMMON_RULES,
        spreads: TAROT_READING_RULES,
      }),
    },
  },
  {
    'tarot-selector': ['tarot-spread-selection'],
    'tarot-interpreter': ['tarot-reading'],
  },
);

// Only the fixed-role ports may import these internal capabilities.
export const selectorAccess = Object.freeze({
  metadata: access.list('tarot-selector')[0],
  load: () => access.load('tarot-selector', 'tarot-spread-selection'),
});
export const interpreterAccess = Object.freeze({
  metadata: access.list('tarot-interpreter')[0],
  load: () => access.load('tarot-interpreter', 'tarot-reading'),
});
