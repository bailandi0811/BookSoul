import { readFileSync } from 'node:fs';
import {
  mkdtemp,
  readFile,
  writeFile,
  symlink,
  unlink,
} from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildTarotSelectionQuestion } from './tarot-selection.rules';
import {
  parseEvaluationFixtures,
  runTarotEvaluation,
  openEvaluationReport,
} from '../../test/tarot-evaluation';
const cases = () =>
  parseEvaluationFixtures(
    JSON.parse(
      readFileSync(
        resolve(__dirname, '../../test/fixtures/tarot-selection-quality.json'),
        'utf8',
      ),
    ),
    JSON.parse(
      readFileSync(
        resolve(__dirname, '../../test/fixtures/tarot-reading-quality.json'),
        'utf8',
      ),
    ),
  );
it('preflights 24 selection and 18 reading cases before external work', () => {
  expect(cases().selection).toHaveLength(24);
  expect(cases().readings).toHaveLength(18);
  expect(() => parseEvaluationFixtures([], [])).toThrow();
});
it('preflights natural questions and keeps held-out wording out of examples', () => {
  const natural = parseEvaluationFixtures(
    JSON.parse(
      readFileSync(
        resolve(
          __dirname,
          '../../test/fixtures/tarot-selection-natural-questions.json',
        ),
        'utf8',
      ),
    ),
    cases().readings,
  ).selection;
  const normalize = (value: string) => value.replace(/[？?\s]/g, '');
  const examples = new Set(
    buildTarotSelectionQuestion().instructions.examples.map((item) =>
      normalize(item.question),
    ),
  );
  expect(natural[0]).toMatchObject({
    question: '我什么时候能遇到真爱',
    expectedSpread: 'three_card',
  });
  for (const item of natural.slice(1))
    expect(examples.has(normalize(item.question))).toBe(false);
});
it('runs at most 24+18 calls and never reviews model quality automatically', async () => {
  const provider = {
    classify: jest.fn(async () => ({
      mode: 'choose' as const,
      spread: null,
      reason: 'unclear' as const,
    })),
    read: jest.fn(async function* () {
      yield '合成回答';
    }),
  };
  const results: unknown[] = [];
  const summary = await runTarotEvaluation(
    cases(),
    provider,
    new AbortController().signal,
    async (result) => {
      results.push(result);
    },
  );
  expect(provider.classify).toHaveBeenCalledTimes(24);
  expect(provider.read).toHaveBeenCalledTimes(18);
  expect(summary.reading.completed).toBe(18);
  expect(results).toHaveLength(42);
});
it('stops on unavailable or error without retries or raw errors', async () => {
  const provider = {
    classify: jest.fn(async () => ({
      mode: 'choose' as const,
      spread: null,
      reason: 'unavailable' as const,
    })),
    read: jest.fn(async function* () {
      yield 'unused';
    }),
  };
  const results: unknown[] = [];
  const summary = await runTarotEvaluation(
    cases(),
    provider,
    new AbortController().signal,
    async (result) => {
      results.push(result);
    },
  );
  expect(provider.classify).toHaveBeenCalledTimes(1);
  expect(provider.read).not.toHaveBeenCalled();
  expect(summary.selection.unattempted).toBe(23);
  provider.classify.mockRejectedValueOnce(new Error('PRIVATE_PROVIDER_ERROR'));
  await runTarotEvaluation(
    cases(),
    provider,
    new AbortController().signal,
    async (result) => {
      results.push(result);
    },
  );
  expect(JSON.stringify(results)).not.toContain('PRIVATE_PROVIDER_ERROR');
});
it('propagates cancellation and leaves remaining cases unattempted', async () => {
  const controller = new AbortController();
  const provider = {
    classify: jest.fn(async () => {
      controller.abort();
      throw new Error('cancel');
    }),
    read: jest.fn(async function* () {
      yield 'unused';
    }),
  };
  const summary = await runTarotEvaluation(
    cases(),
    provider,
    controller.signal,
    async () => {},
  );
  expect(summary.cancelled).toBe(true);
  expect(provider.classify).toHaveBeenCalledTimes(1);
  expect(provider.read).not.toHaveBeenCalled();
});
it('refuses repository reports and existing files before any overwrite', async () => {
  await expect(
    openEvaluationReport(resolve(__dirname, 'forbidden-report.json')),
  ).rejects.toThrow();
  const directory = await mkdtemp(join(tmpdir(), 'booksoul-tarot-eval-'));
  const target = join(directory, 'existing.json');
  await writeFile(target, 'keep');
  await expect(openEvaluationReport(target)).rejects.toThrow();
  expect(await readFile(target, 'utf8')).toBe('keep');
  const file = await openEvaluationReport(join(directory, 'new.json'));
  await file.close();
  const link = join(directory, 'back-to-repo');
  await symlink(
    resolve(__dirname, '../..'),
    link,
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  try {
    await expect(
      openEvaluationReport(join(link, 'forbidden.json')),
    ).rejects.toThrow();
  } finally {
    await unlink(link);
  }
});
it('default CLI never loads env, constructs a chat model or calls fetch', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'booksoul-tarot-dry-'));
  const preload = join(directory, 'deny-external.cjs');
  await writeFile(
    preload,
    `const Module=require('node:module');const original=Module._load;
    Module._load=function(name,...args){if(name==='dotenv')return{config(){throw new Error('ENV_FORBIDDEN')}};
    if(name==='@langchain/openai')return{ChatOpenAI:class{constructor(){throw new Error('MODEL_FORBIDDEN')}}};return original.call(this,name,...args)};
    global.fetch=()=>{throw new Error('NETWORK_FORBIDDEN')};`,
  );
  const output = execFileSync(
    process.execPath,
    [
      '-r',
      preload,
      '-r',
      'ts-node/register',
      'test/run-tarot-reading-quality.ts',
    ],
    {
      cwd: resolve(__dirname, '../..'),
      encoding: 'utf8',
      timeout: 30000,
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
      },
    },
  );
  expect(JSON.parse(output)).toMatchObject({
    externalCalls: 0,
    plannedCalls: 42,
    validSelectionCases: 24,
    validReadingCases: 18,
  });
});
