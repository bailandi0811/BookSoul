import { selectorAccess, interpreterAccess } from './agent-skill.catalog';
import { AgentSkillAccessError } from './agent-skill.types';
import type { TarotSpread } from '../tarot/tarot.types';

export const TAROT_SELECTION_SKILL_METADATA = selectorAccess.metadata;
export const TAROT_READING_SKILL_METADATA = interpreterAccess.metadata;
export function loadTarotSelectionSkill() {
  return Object.freeze({
    agentId: 'tarot-selector' as const,
    skillId: 'tarot-spread-selection' as const,
    skillVersion: selectorAccess.metadata.version,
    content: selectorAccess.load(),
  });
}
export function loadTarotReadingSkill(spread: TarotSpread) {
  const rules = interpreterAccess.load();
  if (!Object.hasOwn(rules.spreads, spread))
    throw new AgentSkillAccessError('AGENT_SKILL_FORBIDDEN');
  return Object.freeze({
    agentId: 'tarot-interpreter' as const,
    skillId: 'tarot-reading' as const,
    skillVersion: interpreterAccess.metadata.version,
    content: `${rules.common}\n${rules.spreads[spread]}`,
  });
}
