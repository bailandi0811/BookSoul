import { access, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const composeFile = resolve(process.env.BOOKSOUL_COMPOSE_FILE || join(repositoryRoot, 'deploy', 'compose.yaml'));
const releaseDirectory = resolve(process.env.BOOKSOUL_RELEASE_DIR || '/etc/booksoul/releases');
const currentRelease = resolve(process.env.BOOKSOUL_CURRENT_ENV || '/etc/booksoul/current.env');
const imageKeys = ['WEB_IMAGE', 'API_IMAGE', 'MIGRATION_IMAGE'];

function fail(message) {
  throw new Error(message);
}

function run(file, args) {
  const result = spawnSync(file, args, { cwd: repositoryRoot, encoding: 'utf8' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.status !== 0) {
    if (result.stderr) process.stderr.write(result.stderr);
    fail(`${file} failed with exit code ${result.status ?? 'unknown'}`);
  }
}

function dockerCommand() {
  if (!process.env.BOOKSOUL_DOCKER_COMMAND) return ['docker'];
  let command;
  try {
    command = JSON.parse(process.env.BOOKSOUL_DOCKER_COMMAND);
  } catch {
    fail('BOOKSOUL_DOCKER_COMMAND must be a JSON array of command arguments');
  }
  if (!Array.isArray(command) || command.length === 0 || command.some((value) => typeof value !== 'string' || !value)) {
    fail('BOOKSOUL_DOCKER_COMMAND must be a non-empty JSON string array');
  }
  return command;
}

function runDocker(args) {
  const [file, ...prefix] = dockerCommand();
  run(file, [...prefix, ...args]);
}

function parseRelease(content) {
  const values = {};
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match || Object.hasOwn(values, match[1])) fail('release env must contain unique KEY=value lines');
    values[match[1]] = match[2];
  }
  for (const key of imageKeys) {
    if (!/^\S+@sha256:[a-f0-9]{64}$/.test(values[key] || '')) {
      fail(`${key} must use an immutable sha256 digest`);
    }
  }
  return values;
}

async function updateCurrentRelease(content) {
  await access(dirname(currentRelease));
  const temporary = `${currentRelease}.tmp-${process.pid}`;
  try {
    await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await rename(temporary, currentRelease);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function main() {
  const [mode, releaseId, ...extra] = process.argv.slice(2);
  if (extra.length || !['prepare', 'activate'].includes(mode)) {
    fail('usage: booksoul-deploy.mjs <prepare|activate> <release-id>');
  }
  if (!/^r[0-9]{8}T[0-9]{6}Z-[0-9a-f]{7,8}$/.test(releaseId || '')) {
    fail('release-id must use rYYYYMMDDTHHMMSSZ-<7-to-8 lowercase hex characters>');
  }

  const releaseFile = join(releaseDirectory, `${releaseId}.env`);
  await access(releaseFile);
  await access(composeFile);
  const content = await readFile(releaseFile, 'utf8');
  const release = parseRelease(content);
  if (mode === 'activate') await access(dirname(currentRelease));

  run(process.execPath, [join(repositoryRoot, 'deploy', 'preflight.mjs'), '--release', releaseFile]);
  const compose = ['compose', '--env-file', releaseFile, '-f', composeFile];
  runDocker([...compose, 'config', '--quiet']);
  runDocker([...compose, '--profile', 'migration', 'pull']);
  for (const key of imageKeys) runDocker(['image', 'inspect', release[key]]);

  if (mode === 'prepare') {
    console.log(`Prepared ${releaseId}; no services or current release were changed.`);
    return;
  }

  try {
    runDocker([...compose, 'up', '-d', '--wait', '--force-recreate', 'web', 'api']);
    runDocker([...compose, 'ps']);
  } catch (error) {
    console.error('Activation may have updated only part of the Compose application. current.env was not changed; inspect the running container image digests before retrying or activating the previous compatible release.');
    throw error;
  }
  await updateCurrentRelease(content);
  console.log(`Activated ${releaseId}; current release updated after health checks passed.`);
}

main().catch((error) => {
  console.error(`Deployment failed: ${error.message}`);
  process.exitCode = 1;
});
