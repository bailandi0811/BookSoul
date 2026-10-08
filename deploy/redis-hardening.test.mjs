import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAclFile,
  buildRedisUrls,
  hardenRedisConfig,
  replaceUniqueEnvValue,
} from './redis-hardening.mjs';

test('hardens the exact loopback Redis listener and adds one ACL file', () => {
  const input = [
    '# fixture',
    'bind 127.0.0.1 -::1',
    'protected-mode yes',
    'port 6379',
    '',
  ].join('\n');

  const output = hardenRedisConfig(input);

  assert.match(output, /^bind 127\.0\.0\.1 -::1 172\.17\.0\.1$/m);
  assert.match(output, /^aclfile \/etc\/redis\/booksoul-users\.acl$/m);
});

test('rejects an unexpected listener or an existing active ACL directive', () => {
  assert.throws(
    () => hardenRedisConfig('bind 0.0.0.0\nprotected-mode yes\nport 6379\n'),
    /expected exactly one loopback bind/,
  );
  assert.throws(
    () =>
      hardenRedisConfig(
        'bind 127.0.0.1 -::1\nprotected-mode yes\nport 6379\naclfile /tmp/existing.acl\n',
      ),
    /existing authentication directive/,
  );
});

test('builds a disabled default user and a key-scoped BookSoul ACL', () => {
  const hash = 'a'.repeat(64);
  const output = buildAclFile(hash);

  assert.match(output, /^user default off/m);
  assert.match(output, new RegExp(`^user booksoul on #${hash} `, 'm'));
  assert.match(output, /~booksoul:\{agent-admission\}:\*/);
  assert.match(output, /-@all/);
  assert.doesNotMatch(output, /\+@all/);
  assert.doesNotMatch(output, /\+@connection/);
  assert.doesNotMatch(output, /\+client\|setinfo/);
  const tokens = output.trim().split(/\s+/);
  for (const command of [
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
  ]) {
    assert.ok(tokens.includes(command), `${command} must be allowed`);
  }
});

test('replaces exactly one env value without rewriting unrelated secrets', () => {
  const input = 'NODE_ENV=production\nREDIS_URL=redis://127.0.0.1:6379\nTOKEN=a$#b\n';
  const output = replaceUniqueEnvValue(
    input,
    'REDIS_URL',
    'redis://booksoul:secret@127.0.0.1:6379',
  );

  assert.equal(
    output,
    'NODE_ENV=production\nREDIS_URL=redis://booksoul:secret@127.0.0.1:6379\nTOKEN=a$#b\n',
  );
  assert.throws(
    () => replaceUniqueEnvValue('NODE_ENV=production\n', 'REDIS_URL', 'x'),
    /exactly once/,
  );
  assert.throws(
    () =>
      replaceUniqueEnvValue(
        'REDIS_URL=a\nREDIS_URL=b\n',
        'REDIS_URL',
        'x',
      ),
    /exactly once/,
  );
});

test('builds local and container Redis URLs from the verified legacy target', () => {
  const urls = buildRedisUrls('redis://127.0.0.1:6379', '0123456789abcdef');

  assert.equal(
    urls.local,
    'redis://booksoul:0123456789abcdef@127.0.0.1:6379',
  );
  assert.equal(
    urls.container,
    'redis://booksoul:0123456789abcdef@host.docker.internal:6379',
  );
  assert.throws(
    () => buildRedisUrls('redis://redis.example:6379', 'a'.repeat(32)),
    /legacy Redis target/,
  );
});
