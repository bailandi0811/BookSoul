import { createSkillAccess } from './agent-skill.access';

const setup = () => {
  const first = jest.fn(() => ({ nested: { value: 'selection' }, items: [1] }));
  const second = jest.fn(() => 'reading');
  const definitions = {
    selection: {
      id: 'selection',
      version: 'v1',
      description: 'Selection',
      kind: 'choice-policy' as const,
      load: first,
    },
    reading: {
      id: 'reading',
      version: 'v1',
      description: 'Reading',
      kind: 'prompt-rules' as const,
      load: second,
    },
    unbound: {
      id: 'unbound',
      version: 'v1',
      description: 'New',
      kind: 'prompt-rules' as const,
      load: jest.fn(() => 'new'),
    },
  };
  const bindings: Record<string, ('selection' | 'reading' | 'unbound')[]> = {
    selector: ['selection'],
    interpreter: ['reading'],
  };
  const access = createSkillAccess<{
    selection: ReturnType<typeof first>;
    reading: string;
    unbound: string;
  }>(definitions, bindings);
  return { first, second, definitions, bindings, access };
};
it('lists only authorized metadata and never loads during discovery', () => {
  const { access, first, second } = setup();
  expect(access.list('selector').map((s) => s.id)).toEqual(['selection']);
  expect(access.list('interpreter').map((s) => s.id)).toEqual(['reading']);
  expect(access.list('unknown')).toEqual([]);
  expect(access.list('selector')[0]).not.toHaveProperty('load');
  expect(first).not.toHaveBeenCalled();
  expect(second).not.toHaveBeenCalled();
  expect(access.load('selector', 'selection').nested.value).toBe('selection');
});
it('refuses cross-role, unknown and registered-but-unbound skills before loading', () => {
  const { access, first, second, definitions } = setup();
  expect(() => access.load('selector', 'reading')).toThrow(
    'AGENT_SKILL_FORBIDDEN',
  );
  expect(() => access.load('interpreter', 'selection')).toThrow(
    'AGENT_SKILL_FORBIDDEN',
  );
  expect(() => access.load('unknown', 'selection')).toThrow(
    'AGENT_SKILL_AGENT_UNKNOWN',
  );
  expect(() => access.load('selector', 'missing' as never)).toThrow(
    'AGENT_SKILL_UNKNOWN',
  );
  expect(() => access.load('selector', 'unbound')).toThrow(
    'AGENT_SKILL_FORBIDDEN',
  );
  expect(() => access.load('toString', 'selection')).toThrow(
    'AGENT_SKILL_AGENT_UNKNOWN',
  );
  expect(first).not.toHaveBeenCalled();
  expect(second).not.toHaveBeenCalled();
  expect(definitions.unbound.load).not.toHaveBeenCalled();
});
it('snapshots the catalog and bindings and freezes independent nested payloads', () => {
  const { access, bindings, definitions, first } = setup();
  bindings.selector.push('reading');
  definitions.selection.version = 'changed';
  definitions.selection.load = jest.fn(() => ({
    nested: { value: 'changed' },
    items: [2],
  }));
  const a = access.load('selector', 'selection');
  expect(Object.isFrozen(a.nested)).toBe(true);
  expect(Object.isFrozen(a.items)).toBe(true);
  expect(Reflect.set(a.nested, 'value', 'poison')).toBe(false);
  expect(Reflect.set(a.items, 0, 9)).toBe(false);
  expect(access.load('selector', 'selection')).toEqual({
    nested: { value: 'selection' },
    items: [1],
  });
  expect(access.load('selector', 'selection')).not.toBe(a);
  expect(access.list('selector')[0].version).toBe('v1');
  expect(() => access.load('selector', 'reading')).toThrow(
    'AGENT_SKILL_FORBIDDEN',
  );
  expect(first).toHaveBeenCalledTimes(3);
});
it('rejects invalid metadata and dangling bindings without invoking loaders', () => {
  const { definitions } = setup();
  for (const changes of [
    { id: 'reading' },
    { version: '' },
    { kind: 'invalid' },
    { description: '' },
    { load: null },
  ]) {
    expect(() =>
      createSkillAccess(
        {
          ...definitions,
          selection: { ...definitions.selection, ...changes },
        } as never,
        { selector: ['selection'] },
      ),
    ).toThrow('AGENT_SKILL_CATALOG_INVALID');
  }
  expect(() =>
    createSkillAccess(definitions, { selector: ['missing' as never] }),
  ).toThrow('AGENT_SKILL_CATALOG_INVALID');
  expect(definitions.selection.load).not.toHaveBeenCalled();
});
it('rejects non-JSON, sparse and cyclic payloads rather than sharing mutable instances', () => {
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  const sparse = new Array<unknown>(2);
  sparse[1] = 1;
  for (const payload of [
    new Date(),
    { method: () => {} },
    sparse,
    cyclic,
    NaN,
    { missing: undefined },
  ]) {
    const access = createSkillAccess(
      {
        unsafe: {
          id: 'unsafe',
          version: 'v1',
          description: 'Unsafe',
          kind: 'prompt-rules',
          load: () => payload,
        },
      },
      { owner: ['unsafe'] },
    );
    expect(() => access.load('owner', 'unsafe')).toThrow(
      'AGENT_SKILL_CATALOG_INVALID',
    );
  }
});
