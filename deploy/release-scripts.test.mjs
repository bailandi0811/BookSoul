import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const publishScript = join(root, 'scripts', 'publish-acr.ps1');
const deployProgram = join(root, 'deploy', 'booksoul-deploy.mjs');
const deployWrapper = join(root, 'deploy', 'booksoul-deploy.sh');
const digest = `sha256:${'a'.repeat(64)}`;

function commandPath(name) {
  const command = process.platform === 'win32' ? 'where.exe' : 'which';
  const result = spawnSync(command, [name], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : null;
}

async function executable(path, body) {
  await writeFile(path, body, 'utf8');
  if (process.platform !== 'win32') await chmod(path, 0o755);
}

async function fakeCommands(directory) {
  const log = join(directory, 'commands.log');
  if (process.platform === 'win32') {
    await executable(join(directory, 'git.cmd'), `@echo off\r\necho git %*>>"%FAKE_COMMAND_LOG%"\r\nif "%1"=="status" if not "%FAKE_GIT_STATUS%"=="" echo %FAKE_GIT_STATUS%\r\nif "%1"=="rev-parse" if "%2"=="--short=8" echo %FAKE_GIT_REVISION:~0,8%& exit /b 0\r\nif "%1"=="rev-parse" echo %FAKE_GIT_REVISION%\r\nexit /b 0\r\n`);
    await executable(join(directory, 'docker.cmd'), `@echo off\r\necho docker %*>>"%FAKE_COMMAND_LOG%"\r\necho %*| findstr /c:"%FAKE_DOCKER_FAIL_MATCH%" >nul 2>nul && exit /b 23\r\nif "%1"=="manifest" if "%2"=="inspect" (\r\n  if "%FAKE_MANIFEST_EXISTS%"=="1" exit /b 0\r\n  echo manifest unknown 1>&2\r\n  exit /b 1\r\n)\r\nif "%1"=="push" echo digest: ${digest} size: 1234\r\nexit /b 0\r\n`);
    await executable(join(directory, 'npm.cmd'), '@echo off\r\necho npm %*>>"%FAKE_COMMAND_LOG%"\r\nexit /b 0\r\n');
    await executable(join(directory, 'flock.cmd'), '@exit /b 0\r\n');
    await executable(join(directory, 'flock'), '#!/usr/bin/env sh\nexit 0\n');
  } else {
    await executable(join(directory, 'git'), `#!/usr/bin/env sh\nprintf 'git %s\\n' "$*" >> "$FAKE_COMMAND_LOG"\nif [ "$1" = status ] && [ -n "$FAKE_GIT_STATUS" ]; then printf '%s\\n' "$FAKE_GIT_STATUS"; fi\nif [ "$1" = rev-parse ] && [ "$2" = --short=8 ]; then printf '%.8s\\n' "$FAKE_GIT_REVISION"; exit 0; fi\nif [ "$1" = rev-parse ]; then printf '%s\\n' "$FAKE_GIT_REVISION"; fi\n`);
    await executable(join(directory, 'docker'), `#!/usr/bin/env sh\nprintf 'docker %s\\n' "$*" >> "$FAKE_COMMAND_LOG"\ncase "$*" in *"$FAKE_DOCKER_FAIL_MATCH"*) [ -n "$FAKE_DOCKER_FAIL_MATCH" ] && exit 23;; esac\nif [ "$1" = push ]; then printf 'digest: ${digest} size: 1234\\n'; fi\n`);
    await executable(join(directory, 'npm'), '#!/usr/bin/env sh\nprintf \'npm %s\\n\' "$*" >> "$FAKE_COMMAND_LOG"\n');
    await executable(join(directory, 'flock'), '#!/usr/bin/env sh\nexit 0\n');
  }
  return log;
}

async function temporaryFixture(run) {
  const directory = await mkdtemp(join(tmpdir(), 'booksoul-release-'));
  try {
    const bin = join(directory, 'bin');
    await mkdir(bin);
    const log = await fakeCommands(bin);
    const fakeDocker = join(directory, 'fake-docker.cjs');
    await writeFile(fakeDocker, [
      "const { appendFileSync } = require('node:fs');",
      "const args = process.argv.slice(2);",
      "appendFileSync(process.env.FAKE_COMMAND_LOG, `docker ${args.join(' ')}\\n`);",
      "if (process.env.FAKE_DOCKER_FAIL_MATCH && process.env.FAKE_DOCKER_FAIL_MATCH !== '__never__' && args.join(' ').includes(process.env.FAKE_DOCKER_FAIL_MATCH)) process.exit(23);",
      `if (args[0] === 'push') console.log('digest: ${digest} size: 1234');`,
    ].join('\n'));
    const env = {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH}`,
      FAKE_COMMAND_LOG: log,
      FAKE_DOCKER_FAIL_MATCH: '__never__',
      FAKE_MANIFEST_EXISTS: '0',
      FAKE_GIT_STATUS: '',
      FAKE_GIT_REVISION: 'c9996337',
      BOOKSOUL_DOCKER_COMMAND: JSON.stringify([process.execPath, fakeDocker]),
    };
    await run({ directory, bin, log, env });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function completedProcess(file, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, options);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

test('publisher pushes three images and writes immutable digest coordinates', async (t) => {
  const pwsh = commandPath('pwsh');
  if (!pwsh) return t.skip('pwsh is unavailable');
  await temporaryFixture(async ({ directory, log, env }) => {
    const output = join(directory, 'releases');
    const result = spawnSync(pwsh, [
      '-NoProfile', '-File', publishScript,
      '-Release', 'r20261009T120000Z-c9996337',
      '-Registry', 'crpi-example.cn-hangzhou.personal.cr.aliyuncs.com/booksoul',
      '-OutputDirectory', output,
    ], { cwd: root, env, encoding: 'utf8' });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const commands = await readFile(log, 'utf8');
    assert.match(commands, /npm --prefix client run check/);
    assert.match(commands, /npm --prefix server run check/);
    assert.match(commands, /git status --porcelain -- .*\.dockerignore/);
    assert.match(commands, /docker build --platform linux\/amd64 .*--target runtime/);
    assert.match(commands, /docker build --platform linux\/amd64 .*--target migration/);
    assert.match(commands, /docker build --platform linux\/amd64 .*client\/Dockerfile/);
    assert.equal((commands.match(/docker manifest inspect /g) ?? []).length, 3);
    assert.equal((commands.match(/docker push /g) ?? []).length, 3);

    const manifest = await readFile(join(output, 'r20261009T120000Z-c9996337.env'), 'utf8');
    assert.match(manifest, new RegExp(`API_IMAGE=.*booksoul-api@${digest}`));
    assert.match(manifest, new RegExp(`WEB_IMAGE=.*booksoul-web@${digest}`));
    assert.match(manifest, new RegExp(`MIGRATION_IMAGE=.*booksoul-migration@${digest}`));
    assert.doesNotMatch(manifest, /PASSWORD|TOKEN|SECRET/);
  });
});

test('publisher stops on a failed push without writing a release manifest', async (t) => {
  const pwsh = commandPath('pwsh');
  if (!pwsh) return t.skip('pwsh is unavailable');
  await temporaryFixture(async ({ directory, env }) => {
    const output = join(directory, 'releases');
    env.FAKE_DOCKER_FAIL_MATCH = 'push';
    const result = spawnSync(pwsh, [
      '-NoProfile', '-File', publishScript,
      '-Release', 'r20261009T120000Z-c9996337',
      '-Registry', 'crpi-example.cn-hangzhou.personal.cr.aliyuncs.com/booksoul',
      '-OutputDirectory', output,
    ], { cwd: root, env, encoding: 'utf8' });

    assert.notEqual(result.status, 0);
    const manifest = spawnSync(process.execPath, ['-e', `require('fs').accessSync(${JSON.stringify(join(output, 'r20261009T120000Z-c9996337.env'))})`]);
    assert.notEqual(manifest.status, 0);
  });
});

test('publisher rejects relevant uncommitted source before invoking Docker', async (t) => {
  const pwsh = commandPath('pwsh');
  if (!pwsh) return t.skip('pwsh is unavailable');
  await temporaryFixture(async ({ directory, log, env }) => {
    env.FAKE_GIT_STATUS = ' M client/src/App.tsx';
    const result = spawnSync(pwsh, [
      '-NoProfile', '-File', publishScript,
      '-Release', 'r20261009T120000Z-c9996337',
      '-Registry', 'crpi-example.cn-hangzhou.personal.cr.aliyuncs.com/booksoul',
      '-OutputDirectory', join(directory, 'releases'),
    ], { cwd: root, env, encoding: 'utf8' });

    assert.notEqual(result.status, 0);
    const commands = await readFile(log, 'utf8');
    assert.doesNotMatch(commands, /docker |npm /);
  });
});

test('publisher rejects a release whose revision does not match HEAD', async (t) => {
  const pwsh = commandPath('pwsh');
  if (!pwsh) return t.skip('pwsh is unavailable');
  await temporaryFixture(async ({ directory, log, env }) => {
    const result = spawnSync(pwsh, [
      '-NoProfile', '-File', publishScript,
      '-Release', 'r20261009T120000Z-deadbee',
      '-Registry', 'crpi-example.cn-hangzhou.personal.cr.aliyuncs.com/booksoul',
      '-OutputDirectory', join(directory, 'releases'),
    ], { cwd: root, env, encoding: 'utf8' });

    assert.notEqual(result.status, 0);
    const commands = await readFile(log, 'utf8');
    assert.doesNotMatch(commands, /docker |npm /);
  });
});

test('publisher refuses to overwrite an existing remote tag', async (t) => {
  const pwsh = commandPath('pwsh');
  if (!pwsh) return t.skip('pwsh is unavailable');
  await temporaryFixture(async ({ directory, log, env }) => {
    env.FAKE_MANIFEST_EXISTS = '1';
    const result = spawnSync(pwsh, [
      '-NoProfile', '-File', publishScript,
      '-Release', 'r20261009T120000Z-c9996337',
      '-Registry', 'crpi-example.cn-hangzhou.personal.cr.aliyuncs.com/booksoul',
      '-OutputDirectory', join(directory, 'releases'),
    ], { cwd: root, env, encoding: 'utf8' });

    assert.notEqual(result.status, 0);
    const commands = await readFile(log, 'utf8');
    assert.doesNotMatch(commands, /docker build|docker push/);
  });
});

test('publisher rejects a release revision longer than the documented short SHA', async (t) => {
  const pwsh = commandPath('pwsh');
  if (!pwsh) return t.skip('pwsh is unavailable');
  await temporaryFixture(async ({ directory, log, env }) => {
    const result = spawnSync(pwsh, [
      '-NoProfile', '-File', publishScript,
      '-Release', 'r20261009T120000Z-c9996337a',
      '-Registry', 'crpi-example.cn-hangzhou.personal.cr.aliyuncs.com/booksoul',
      '-OutputDirectory', join(directory, 'releases'),
    ], { cwd: root, env, encoding: 'utf8' });

    assert.notEqual(result.status, 0);
    await assert.rejects(readFile(log, 'utf8'));
  });
});

test('publisher serializes concurrent releases from the same checkout', async (t) => {
  const pwsh = commandPath('pwsh');
  if (!pwsh) return t.skip('pwsh is unavailable');
  await temporaryFixture(async ({ directory, env }) => {
    const common = [
      '-NoProfile', '-File', publishScript,
      '-Release', 'r20261009T120000Z-c9996337',
      '-Registry', 'crpi-example.cn-hangzhou.personal.cr.aliyuncs.com/booksoul',
    ];
    const first = completedProcess(pwsh, [...common, '-OutputDirectory', join(directory, 'first')], {
      cwd: root, env, encoding: 'utf8',
    });
    const second = completedProcess(pwsh, [...common, '-OutputDirectory', join(directory, 'second')], {
      cwd: root, env, encoding: 'utf8',
    });
    const results = await Promise.all([first, second]);

    assert.deepEqual(results.map(({ status }) => status).sort(), [0, 1]);
    const failed = results.find(({ status }) => status !== 0);
    assert.match(`${failed.stdout}\n${failed.stderr}`, /Another BookSoul ACR publish is already running/);
  });
});

async function deploymentFiles(directory) {
  const upload = join(directory, 'books');
  const tls = join(directory, 'tls');
  const app = join(directory, 'app.env');
  const releases = join(directory, 'releases');
  await mkdir(upload);
  await mkdir(tls);
  await mkdir(releases);
  await writeFile(join(tls, 'fullchain.pem'), 'fixture');
  await writeFile(join(tls, 'privkey.pem'), 'fixture');
  await writeFile(app, [
    'NODE_ENV=production',
    'BOOK_UPLOAD_DIR=/data/books',
    'CORS_ORIGINS=https://reader.example',
    'DATABASE_URL=postgresql://fixture:fixture@db.invalid/booksoul?schema=public',
    `JWT_ACCESS_SECRET=${'b'.repeat(64)}`,
    'OPENAI_API_KEY=fixture-do-not-connect',
    'MILVUS_ADDRESS=vector.invalid:19530',
    'AGENT_ADMISSION_MODE=local',
  ].join('\n'));
  const release = join(releases, 'r20261009T120000Z-c9996337.env');
  await writeFile(release, [
    `WEB_IMAGE=registry.invalid/booksoul-web@${digest}`,
    `API_IMAGE=registry.invalid/booksoul-api@${digest}`,
    `MIGRATION_IMAGE=registry.invalid/booksoul-migration@${digest}`,
    `APP_ENV_FILE=${app}`,
    `UPLOAD_HOST_DIR=${upload}`,
    `TLS_HOST_DIR=${tls}`,
  ].join('\n'));
  return { release, releases };
}

test('prepare validates and pulls without changing current release or starting services', async (t) => {
  await temporaryFixture(async ({ directory, log, env }) => {
    const { releases } = await deploymentFiles(directory);
    const current = join(directory, 'current.env');
    Object.assign(env, {
      BOOKSOUL_RELEASE_DIR: releases,
      BOOKSOUL_CURRENT_ENV: current,
      BOOKSOUL_LOCK_FILE: join(directory, 'deploy.lock'),
    });
    const result = spawnSync(process.execPath, [deployProgram, 'prepare', 'r20261009T120000Z-c9996337'], {
      cwd: root, env, encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const commands = await readFile(log, 'utf8');
    assert.match(commands, /compose .* config --quiet/);
    assert.match(commands, /compose .* --profile migration pull/);
    assert.equal((commands.match(/docker image inspect /g) ?? []).length, 3);
    assert.doesNotMatch(commands, / up /);
    await assert.rejects(lstat(current));
  });
});

test('activate changes current release only after services become healthy', async (t) => {
  await temporaryFixture(async ({ directory, log, env }) => {
    const { release, releases } = await deploymentFiles(directory);
    const current = join(directory, 'current.env');
    Object.assign(env, {
      BOOKSOUL_RELEASE_DIR: releases,
      BOOKSOUL_CURRENT_ENV: current,
      BOOKSOUL_LOCK_FILE: join(directory, 'deploy.lock'),
    });
    const result = spawnSync(process.execPath, [deployProgram, 'activate', 'r20261009T120000Z-c9996337'], {
      cwd: root, env, encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const commands = await readFile(log, 'utf8');
    assert.match(commands, / up -d --wait --force-recreate web api/);
    assert.match(commands, / ps$/m);
    assert.equal(await readFile(current, 'utf8'), await readFile(release, 'utf8'));
  });
});

test('failed activation leaves the previous current release unchanged', async () => {
  await temporaryFixture(async ({ directory, env }) => {
    const { releases } = await deploymentFiles(directory);
    const current = join(directory, 'current.env');
    await writeFile(current, 'previous-release\n');
    Object.assign(env, {
      BOOKSOUL_RELEASE_DIR: releases,
      BOOKSOUL_CURRENT_ENV: current,
      BOOKSOUL_LOCK_FILE: join(directory, 'deploy.lock'),
      FAKE_DOCKER_FAIL_MATCH: 'up -d',
    });
    const result = spawnSync(process.execPath, [deployProgram, 'activate', 'r20261009T120000Z-c9996337'], {
      cwd: root, env, encoding: 'utf8',
    });

    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /may have updated only part of the Compose application/);
    assert.equal(await readFile(current, 'utf8'), 'previous-release\n');
  });
});

test('activation rejects a missing current-release directory before replacing services', async () => {
  await temporaryFixture(async ({ directory, log, env }) => {
    const { releases } = await deploymentFiles(directory);
    Object.assign(env, {
      BOOKSOUL_RELEASE_DIR: releases,
      BOOKSOUL_CURRENT_ENV: join(directory, 'absent', 'current.env'),
      BOOKSOUL_LOCK_FILE: join(directory, 'deploy.lock'),
    });
    const result = spawnSync(process.execPath, [deployProgram, 'activate', 'r20261009T120000Z-c9996337'], {
      cwd: root, env, encoding: 'utf8',
    });

    assert.notEqual(result.status, 0);
    const commands = await readFile(log, 'utf8').catch(() => '');
    assert.doesNotMatch(commands, / up /);
  });
});

test('deployment rejects an unsafe release identifier before invoking Docker', async (t) => {
  await temporaryFixture(async ({ directory, log, env }) => {
    Object.assign(env, {
      BOOKSOUL_RELEASE_DIR: join(directory, 'releases'),
      BOOKSOUL_CURRENT_ENV: join(directory, 'current.env'),
      BOOKSOUL_LOCK_FILE: join(directory, 'deploy.lock'),
    });
    const result = spawnSync(process.execPath, [deployProgram, 'prepare', '../../etc/passwd'], {
      cwd: root, env, encoding: 'utf8',
    });

    assert.notEqual(result.status, 0);
    await assert.rejects(readFile(log, 'utf8'));
  });
});

test('bash wrapper acquires the deployment lock and delegates to the Node program', async (t) => {
  const bash = process.env.BOOKSOUL_TEST_BASH || (process.platform === 'win32' ? null : commandPath('bash'));
  if (!bash) return t.skip('a compatible bash is unavailable');
  await temporaryFixture(async ({ directory, env }) => {
    env.BOOKSOUL_LOCK_FILE = join(directory, 'deploy.lock');
    const result = spawnSync(bash, [deployWrapper, 'prepare', '../../etc/passwd'], {
      cwd: root, env, encoding: 'utf8',
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /release-id must use/);
    assert.doesNotMatch(result.stderr, /not found|No such file/i);
  });
});
