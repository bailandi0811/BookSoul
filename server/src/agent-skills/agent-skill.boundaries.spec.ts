import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import * as ts from 'typescript';

type BoundaryViolation = { file: string; reason: string };
const serverRoot = resolve(__dirname, '../..');
const sourceRoot = resolve(serverRoot, 'src');
const config = ts.readConfigFile(resolve(serverRoot, 'tsconfig.json'), (file) =>
  ts.sys.readFile(file),
);
if (config.error) throw new Error('Cannot read compiler configuration');
const configJson = config.config as {
  compilerOptions?: Record<string, unknown>;
};
if (!configJson.compilerOptions) throw new Error('Missing compiler options');
const convertedOptions = ts.convertCompilerOptionsFromJson(
  configJson.compilerOptions,
  serverRoot,
);
if (convertedOptions.errors.length) throw new Error('Invalid compiler options');
const compilerOptions = convertedOptions.options;
const normalize = (path: string) =>
  relative(serverRoot, path)
    .replace(/\\/g, '/')
    .replace(/\.(ts|js)$/, '')
    .toLowerCase();
const internalOwners: Record<string, readonly string[]> = {
  'src/agent-skills/agent-skill.access': [
    'src/agent-skills/agent-skill.catalog',
  ],
  'src/agent-skills/agent-skill.catalog': [
    'src/agent-skills/tarot-agent-skills',
  ],
  'src/agent-skills/agent-skill.types': [
    'src/agent-skills/agent-skill.access',
    'src/agent-skills/tarot-agent-skills',
  ],
  'src/tarot/tarot-selection.rules': ['src/agent-skills/agent-skill.catalog'],
  'src/tarot/tarot-reading.rules': ['src/agent-skills/agent-skill.catalog'],
};
const portSymbols: Record<string, readonly string[]> = {
  'src/tarot/tarot-provider.service': [
    'loadTarotSelectionSkill',
    'TAROT_READING_SKILL_METADATA',
  ],
  'src/tarot/tarot-reading.prompt': [
    'loadTarotReadingSkill',
    'TAROT_READING_SKILL_METADATA',
  ],
  'test/run-tarot-reading-quality': [
    'TAROT_SELECTION_SKILL_METADATA',
    'TAROT_READING_SKILL_METADATA',
  ],
};

function checkSkillImports(
  filePath: string,
  source: string,
): BoundaryViolation[] {
  const owner = normalize(filePath);
  const violations: BoundaryViolation[] = [];
  const capabilities = new Set<string>();
  const fail = (reason: string) => {
    violations.push({
      file: relative(serverRoot, filePath).replace(/\\/g, '/'),
      reason,
    });
  };
  const check = (specifier: string, node: ts.Node) => {
    const resolved = ts.resolveModuleName(
      specifier,
      filePath,
      compilerOptions,
      ts.sys,
    ).resolvedModule?.resolvedFileName;
    const fallback = specifier.startsWith('.')
      ? resolve(dirname(filePath), specifier)
      : resolve(serverRoot, specifier);
    const target = normalize(resolved || fallback);
    const protectedTarget =
      target.startsWith('src/agent-skills/') ||
      target === 'src/agent-skills' ||
      Object.hasOwn(internalOwners, target);
    if (!protectedTarget) return;
    if (ts.isExportDeclaration(node)) {
      fail('SKILL_REEXPORT_FORBIDDEN');
      return;
    }
    if (target === 'src/agent-skills/tarot-agent-skills') {
      const allowed = portSymbols[owner];
      const bindings = ts.isImportDeclaration(node)
        ? node.importClause?.namedBindings
        : undefined;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const item of bindings.elements)
          if ((item.propertyName?.text || item.name.text).startsWith('load'))
            capabilities.add(item.name.text);
      }
      if (
        !allowed ||
        !bindings ||
        !ts.isNamedImports(bindings) ||
        !bindings.elements.length ||
        (ts.isImportDeclaration(node) && node.importClause?.name) ||
        bindings.elements.some(
          (item) =>
            !allowed.includes(item.propertyName?.text || item.name.text),
        )
      )
        fail('SKILL_PORT_IMPORT_FORBIDDEN');
      return;
    }
    if (!internalOwners[target]?.includes(owner))
      fail('SKILL_INTERNAL_IMPORT_FORBIDDEN');
  };
  const tree = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    )
      check(node.moduleSpecifier.text, node);
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    )
      check(node.moduleReference.expression.text, node);
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    )
      check(node.argument.literal.text, node);
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === 'require') ||
        (ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === 'require'))
    ) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteralLike(arg)) check(arg.text, node);
      else if (
        owner.startsWith('src/agent-skills/') ||
        Object.hasOwn(portSymbols, owner)
      )
        fail('SKILL_DYNAMIC_MODULE_FORBIDDEN');
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  const referencesCapability = (node: ts.Node): boolean => {
    if (ts.isIdentifier(node) && capabilities.has(node.text)) return true;
    return ts.forEachChild(node, referencesCapability) || false;
  };
  const declarations: ts.VariableDeclaration[] = [];
  const collect = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node)) declarations.push(node);
    ts.forEachChild(node, collect);
  };
  collect(tree);
  // Follow local aliases before checking exports, including aliases declared after imports.
  let changed = true;
  while (changed) {
    changed = false;
    for (const declaration of declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer &&
        referencesCapability(declaration.initializer) &&
        !capabilities.has(declaration.name.text)
      ) {
        capabilities.add(declaration.name.text);
        changed = true;
      }
    }
  }
  for (const statement of tree.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      !statement.moduleSpecifier &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      if (
        statement.exportClause.elements.some((item) =>
          capabilities.has(item.propertyName?.text || item.name.text),
        )
      )
        fail('SKILL_LOCAL_EXPORT_FORBIDDEN');
    }
    if (
      ts.isExportAssignment(statement) &&
      referencesCapability(statement.expression)
    )
      fail('SKILL_LOCAL_EXPORT_FORBIDDEN');
    const exported =
      ts.canHaveModifiers(statement) &&
      ts
        .getModifiers(statement)
        ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    if (
      ts.isVariableStatement(statement) &&
      referencesCapability(statement.declarationList)
    )
      fail('SKILL_LOCAL_EXPORT_FORBIDDEN');
    if (
      ts.isFunctionDeclaration(statement) &&
      referencesCapability(statement) &&
      !(
        owner === 'src/tarot/tarot-reading.prompt' &&
        statement.name?.text === 'buildTarotReadingMessages'
      )
    )
      fail('SKILL_LOCAL_EXPORT_FORBIDDEN');
  }
  return violations;
}
const sourceAt = (path: string) => resolve(sourceRoot, path);
it('uses the real compiler options for protected module resolution', () => {
  expect(resolve(compilerOptions.baseUrl!)).toBe(serverRoot);
  expect(compilerOptions.moduleResolution).toBe(
    ts.ModuleResolutionKind.NodeNext,
  );
});
it.each([
  'export {select};',
  'export {select as leaked};',
  'export const exposed=select;',
  'const alias=select; export {alias};',
  'export const exposed=()=>select();',
  'export function exposed(){return select();}',
])('rejects local capability forwarding: %s', (forwarding) => {
  expect(
    checkSkillImports(
      sourceAt('tarot/tarot-provider.service.ts'),
      `import {loadTarotSelectionSkill as select} from '../agent-skills/tarot-agent-skills'; ${forwarding}`,
    ),
  ).not.toEqual([]);
});
it.each([
  [
    "import {buildTarotSelectionQuestion} from '../tarot/tarot-selection.rules'",
    'agent/rogue.ts',
  ],
  ["export * from '../agent-skills/tarot-agent-skills'", 'agent/barrel.ts'],
  ["const x=require('../agent-skills/agent-skill.catalog')", 'agent/rogue.ts'],
  [
    "import x = require('../agent-skills/agent-skill.access')",
    'agent/rogue.ts',
  ],
  ["import('../tarot/tarot-reading.rules.js')", 'agent/rogue.ts'],
  [
    "import {loadTarotReadingSkill} from 'src/agent-skills/tarot-agent-skills'",
    'agent/rogue.ts',
  ],
  [
    "import {loadTarotReadingSkill} from '../agent-skills/./tarot-agent-skills.ts'",
    'tarot/tarot-provider.service.ts',
  ],
  [
    "import {loadTarotSelectionSkill} from '../agent-skills/tarot-agent-skills'",
    'tarot/tarot-reading.prompt.ts',
  ],
  [
    "import * as all from '../agent-skills/tarot-agent-skills'",
    'tarot/tarot-provider.service.ts',
  ],
  ["export * from './agent-skill.catalog'", 'agent-skills/index.ts'],
  ["import('../agent-skills')", 'agent/rogue.ts'],
  ['require(dynamicPath)', 'agent-skills/agent-skill.catalog.ts'],
])('rejects bypass %s', (source, file) => {
  expect(checkSkillImports(sourceAt(file), source)).not.toEqual([]);
});
it('allows only explicit production ports and metadata-only CLI imports', () => {
  expect(
    checkSkillImports(
      sourceAt('tarot/tarot-provider.service.ts'),
      "import {loadTarotSelectionSkill,TAROT_READING_SKILL_METADATA} from '../agent-skills/tarot-agent-skills'",
    ),
  ).toEqual([]);
  const cli = resolve(serverRoot, 'test/run-tarot-reading-quality.ts');
  expect(
    checkSkillImports(
      cli,
      "import {TAROT_SELECTION_SKILL_METADATA} from '../src/agent-skills/tarot-agent-skills'",
    ),
  ).toEqual([]);
  expect(
    checkSkillImports(
      cli,
      "import {loadTarotSelectionSkill} from '../src/agent-skills/tarot-agent-skills'",
    ),
  ).not.toEqual([]);
});
it('checks all production sources and both offline evaluation entry points', () => {
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, item.name);
      if (item.isDirectory()) visit(path);
      else if (item.name.endsWith('.ts') && !item.name.endsWith('.spec.ts'))
        files.push(path);
    }
  };
  visit(sourceRoot);
  files.push(
    resolve(serverRoot, 'test/run-tarot-reading-quality.ts'),
    resolve(serverRoot, 'test/tarot-evaluation.ts'),
  );
  expect(files.length).toBeGreaterThan(50);
  const violations = files.flatMap((file) =>
    checkSkillImports(file, readFileSync(file, 'utf8')),
  );
  expect(violations).toEqual([]);
  expect(
    files.some((file) => relative(sourceRoot, file).startsWith('agent')),
  ).toBe(true);
});
