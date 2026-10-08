import {
  AgentSkillAccessError,
  type SkillDefinition,
  type SkillMetadata,
} from './agent-skill.types';

function invalid(): never {
  throw new AgentSkillAccessError('AGENT_SKILL_CATALOG_INVALID');
}
function copyData(value: unknown, ancestors = new Set<object>()): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || ancestors.has(value))
    return invalid();
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return Object.freeze(
        Array.from(value, (item, index) => {
          if (!Object.hasOwn(value, index)) return invalid();
          return copyData(item, ancestors);
        }),
      );
    }
    if (
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    )
      return invalid();
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          copyData(item, ancestors),
        ]),
      ),
    );
  } finally {
    ancestors.delete(value);
  }
}

// Internal factory: runtime entry points receive a fixed-role port, never this object.
export function createSkillAccess<S extends Record<string, unknown>>(
  definitions: { [K in keyof S]: SkillDefinition<S[K]> },
  bindings: Readonly<Record<string, readonly (keyof S & string)[]>>,
) {
  const catalog = new Map<string, SkillDefinition<unknown>>();
  const permissions = new Map<string, ReadonlySet<string>>();
  for (const [id, definition] of Object.entries<SkillDefinition<unknown>>(
    definitions,
  )) {
    if (
      definition.id !== id ||
      !/^[a-z][a-z0-9-]*$/.test(id) ||
      !definition.version?.trim() ||
      !definition.description?.trim() ||
      !['choice-policy', 'prompt-rules'].includes(definition.kind) ||
      typeof definition.load !== 'function'
    )
      invalid();
    catalog.set(
      id,
      Object.freeze({
        id,
        version: definition.version,
        description: definition.description,
        kind: definition.kind,
        load: definition.load,
      }),
    );
  }
  for (const [agentId, skillIds] of Object.entries(bindings)) {
    if (
      !agentId.trim() ||
      !Array.isArray(skillIds) ||
      new Set(skillIds).size !== skillIds.length ||
      skillIds.some((id: unknown) => typeof id !== 'string' || !catalog.has(id))
    )
      invalid();
    permissions.set(agentId, new Set(skillIds));
  }
  return Object.freeze({
    list(agentId: string): readonly SkillMetadata[] {
      return Object.freeze(
        Array.from(permissions.get(agentId) || [], (id) => {
          const definition = catalog.get(id)!;
          return Object.freeze({
            id: definition.id,
            version: definition.version,
            description: definition.description,
            kind: definition.kind,
          });
        }),
      );
    },
    load<K extends keyof S & string>(
      agentId: string,
      skillId: K,
    ): Readonly<S[K]> {
      const allowed = permissions.get(agentId);
      if (!allowed)
        throw new AgentSkillAccessError('AGENT_SKILL_AGENT_UNKNOWN');
      const definition = catalog.get(skillId);
      if (!definition) throw new AgentSkillAccessError('AGENT_SKILL_UNKNOWN');
      if (!allowed.has(skillId))
        throw new AgentSkillAccessError('AGENT_SKILL_FORBIDDEN');
      // Payload type is supplied by the trusted catalog; validate/copy its JSON shape here.
      return copyData(definition.load()) as Readonly<S[K]>;
    },
  });
}
