import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'booksoul-preflight-'));
  const upload = join(root, 'books');
  const tls = join(root, 'tls');
  const app = join(root, 'app.env');
  const release = join(root, 'release.env');
  await mkdir(upload);
  await mkdir(tls);
  for (const file of ['fullchain.pem', 'privkey.pem']) await writeFile(join(tls, file), 'fixture-not-a-real-certificate');
  const settings = {
    WEB_IMAGE: 'booksoul-web:release-001',
    API_IMAGE: 'booksoul-api:release-001',
    MIGRATION_IMAGE: 'booksoul-migration:release-001',
    APP_ENV_FILE: app, UPLOAD_HOST_DIR: upload, TLS_HOST_DIR: tls,
  };
  const runtime = {
    NODE_ENV: 'production', BOOK_UPLOAD_DIR: '/data/books',
    CORS_ORIGINS: 'https://reader.example',
    DATABASE_URL: 'postgresql://fixture:fixture@db.invalid/booksoul?schema=public',
    JWT_ACCESS_SECRET: 'a'.repeat(64),
    OPENAI_API_KEY: 'fixture-do-not-connect',
    MILVUS_ADDRESS: 'vector.invalid:19530',
    AGENT_ADMISSION_MODE: 'local',
  };
  const serialize = (values) => Object.entries(values).map(([k,v]) => `${k}=${v}`).join('\n');
  const check = async () => {
    await writeFile(app, serialize(runtime));
    await writeFile(release, serialize(settings));
    return spawnSync(process.execPath, ['deploy/preflight.mjs', '--release', release], { encoding: 'utf8' });
  };
  try { await run({ root, upload, tls, runtime, settings, check }); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test('accepts existing deployment files without contacting dependencies', () => fixture(async ({ check }) => {
  const result = await check();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS/);
}));

for (const key of ['WEB_IMAGE', 'API_IMAGE', 'MIGRATION_IMAGE', 'APP_ENV_FILE', 'UPLOAD_HOST_DIR', 'TLS_HOST_DIR']) {
  test(`rejects missing ${key}`, () => fixture(async ({ settings, check }) => {
    delete settings[key];
    assert.equal((await check()).status, 1);
  }));
}

for (const [key, value] of [
  ['NODE_ENV','development'], ['BOOK_UPLOAD_DIR','uploads/books'],
  ['CORS_ORIGINS','http://reader.example'], ['CORS_ORIGINS','https://localhost:5173'],
  ['CORS_ORIGINS','https://reader.example/path'], ['DATABASE_URL','postgresql://fixture@localhost/booksoul'],
  ['MILVUS_ADDRESS','localhost:19530'], ['JWT_ACCESS_SECRET','short'],
  ['AGENT_ADMISSION_MODE','unknown'], ['AGENT_ADMISSION_MODE','redis'],
]) {
  test(`rejects invalid deployment setting ${key}: ${value}`, () => fixture(async ({ runtime, check }) => {
    runtime[key] = value;
    const result = await check();
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stderr, /fixture:fixture|fixture-do-not-connect/);
  }));
}

test('rejects missing upload directory instead of creating it', () => fixture(async ({ settings, root, check }) => {
  settings.UPLOAD_HOST_DIR = join(root, 'absent');
  assert.equal((await check()).status, 1);
}));
test('rejects missing TLS private key', () => fixture(async ({ tls, check }) => {
  await rm(join(tls, 'privkey.pem'));
  assert.equal((await check()).status, 1);
}));
test('rejects floating image tags', () => fixture(async ({ settings, check }) => {
  settings.WEB_IMAGE = 'booksoul-web:latest';
  assert.equal((await check()).status, 1);
}));
test('rejects a directory where an env file is expected', () => fixture(async ({ settings, root, check }) => {
  settings.APP_ENV_FILE = root;
  assert.equal((await check()).status, 1);
}));
test('does not consume ambient environment as missing configuration', () => fixture(async ({ runtime, check }) => {
  delete runtime.DATABASE_URL;
  assert.equal((await check()).status, 1);
}));
test('rejects quoted values because Compose raw env does not unquote them', () => fixture(async ({ runtime, check }) => {
  runtime.JWT_ACCESS_SECRET = '"' + 'a'.repeat(64) + '"';
  assert.equal((await check()).status, 1);
}));
test('accepts literal dollar and hash characters in raw credentials', () => fixture(async ({ runtime, check }) => {
  runtime.OPENAI_API_KEY = 'fixture$literal#key';
  assert.equal((await check()).status, 0);
}));
test('rejects a full Milvus URL pointing at container localhost', () => fixture(async ({ runtime, check }) => {
  runtime.MILVUS_ADDRESS = 'https://localhost:19530';
  assert.equal((await check()).status, 1);
}));
test('accepts an HTTPS cloud vector endpoint', () => fixture(async ({ runtime, check }) => {
  runtime.MILVUS_ADDRESS = 'https://vector.invalid:443';
  assert.equal((await check()).status, 0);
}));
