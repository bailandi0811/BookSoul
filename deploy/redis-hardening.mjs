import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const ACL_PATH = '/etc/redis/booksoul-users.acl';

function activeLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

export function hardenRedisConfig(text) {
  const lines = activeLines(text);
  const bindLines = lines.filter((line) => line.startsWith('bind '));
  if (bindLines.length !== 1 || bindLines[0] !== 'bind 127.0.0.1 -::1') {
    throw new Error('expected exactly one loopback bind directive');
  }
  if (lines.filter((line) => line === 'protected-mode yes').length !== 1) {
    throw new Error('expected protected-mode yes exactly once');
  }
  if (lines.filter((line) => line === 'port 6379').length !== 1) {
    throw new Error('expected port 6379 exactly once');
  }
  if (
    lines.some((line) => /^(aclfile|requirepass|user)(?:\s|$)/.test(line))
  ) {
    throw new Error('existing authentication directive requires manual review');
  }

  const hardened = text.replace(
    /^(\s*)bind 127\.0\.0\.1 -::1\s*$/m,
    '$1bind 127.0.0.1 -::1 172.17.0.1',
  );
  const separator = hardened.endsWith('\n') ? '' : '\n';
  return `${hardened}${separator}\n# BookSoul Docker Redis ACL\naclfile ${ACL_PATH}\n`;
}

export function buildAclFile(passwordHash) {
  if (!/^[a-f0-9]{64}$/.test(passwordHash)) {
    throw new Error('password hash must be 64 lowercase hexadecimal characters');
  }
  const commands = [
    '+ping',
    '+quit',
    '+auth',
    '+hello',
    '+select',
    '+client|setname',
    '+eval',
    '+time',
    '+zremrangebyscore',
    '+exists',
    '+zcard',
    '+set',
    '+zadd',
    '+get',
    '+pexpire',
    '+del',
    '+zrem',
  ];
  return [
    'user default off',
    `user booksoul on #${passwordHash} resetkeys ~booksoul:{agent-admission}:* resetchannels -@all ${commands.join(' ')}`,
    '',
  ].join('\n');
}

export function replaceUniqueEnvValue(text, key, value) {
  const matcher = new RegExp(`^${key}=.*$`, 'gm');
  const matches = text.match(matcher) ?? [];
  if (matches.length !== 1) {
    throw new Error(`${key} must appear exactly once`);
  }
  return text.replace(matcher, `${key}=${value}`);
}

export function buildRedisUrls(legacyUrl, password) {
  if (!/^[a-f0-9]{16,}$/.test(password)) {
    throw new Error('Redis password must be hexadecimal and at least 16 characters');
  }
  const url = new URL(legacyUrl);
  if (
    url.protocol !== 'redis:' ||
    url.hostname !== '127.0.0.1' ||
    (url.port || '6379') !== '6379' ||
    url.username ||
    url.password ||
    (url.pathname && url.pathname !== '/') ||
    url.search ||
    url.hash
  ) {
    throw new Error('legacy Redis target must be unauthenticated 127.0.0.1:6379');
  }

  url.username = 'booksoul';
  url.password = password;
  url.port = '6379';
  url.pathname = '';
  const local = url.toString();
  url.hostname = 'host.docker.internal';
  return { local, container: url.toString() };
}

function envValue(text, key) {
  const matcher = new RegExp(`^${key}=(.*)$`, 'gm');
  const matches = [...text.matchAll(matcher)];
  if (matches.length !== 1) throw new Error(`${key} must appear exactly once`);
  return matches[0][1];
}

async function main(argv) {
  const [command, ...args] = argv;
  if (command === 'harden-config' && args.length === 2) {
    const [input, output] = args;
    await writeFile(output, hardenRedisConfig(await readFile(input, 'utf8')), {
      mode: 0o600,
    });
    return;
  }
  if (command === 'build-acl' && args.length === 2) {
    const [hashFile, output] = args;
    const hash = (await readFile(hashFile, 'utf8')).trim();
    await writeFile(output, buildAclFile(hash), { mode: 0o600 });
    return;
  }
  if (command === 'rewrite-env' && args.length === 5) {
    const [input, passwordFile, output, localUrlFile, containerUrlFile] = args;
    const text = await readFile(input, 'utf8');
    const password = (await readFile(passwordFile, 'utf8')).trim();
    const urls = buildRedisUrls(envValue(text, 'REDIS_URL'), password);
    await writeFile(output, replaceUniqueEnvValue(text, 'REDIS_URL', urls.local), {
      mode: 0o600,
    });
    await writeFile(localUrlFile, urls.local, { mode: 0o600 });
    await writeFile(containerUrlFile, urls.container, { mode: 0o600 });
    return;
  }
  throw new Error('invalid redis-hardening command');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
