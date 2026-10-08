export type SkillMetadata = Readonly<{
  id: string;
  version: string;
  description: string;
  kind: 'choice-policy' | 'prompt-rules';
}>;
export type SkillDefinition<T> = SkillMetadata & { readonly load: () => T };
export type AgentSkillErrorCode =
  | 'AGENT_SKILL_AGENT_UNKNOWN'
  | 'AGENT_SKILL_UNKNOWN'
  | 'AGENT_SKILL_FORBIDDEN'
  | 'AGENT_SKILL_CATALOG_INVALID';
export class AgentSkillAccessError extends Error {
  constructor(readonly code: AgentSkillErrorCode) {
    super(code);
    this.name = 'AgentSkillAccessError';
  }
}
