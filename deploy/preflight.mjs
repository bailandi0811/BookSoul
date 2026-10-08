import { access, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

function requireValue(values, key) {
  if (!values[key]?.trim()) throw new Error(`${key}: required`);
  return values[key];
}
function fail(key, reason) { throw new Error(`${key}: ${reason}`); }
async function envFile(path, key) {
  try {
    if (!(await stat(path)).isFile()) fail(key, 'must be a file');
    const values = {};
    for (const line of (await readFile(path, 'utf8')).split(/\r?\n/)) {
      if (!line.trim() || line.trimStart().startsWith('#')) continue;
      const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
      if (!match || Object.hasOwn(values, match[1])) fail(key, 'use unique KEY=value lines');
      const [, name, value] = match;
      // Match Compose format: raw; do not interpret quotes, comments or dollars.
      if (value !== value.trim() || /^["']|["']$/.test(value)) fail(key, 'use unquoted literal values');
      values[name] = value;
    }
    return values;
  } catch { fail(key, 'must be a readable env file'); }
}
async function directory(path, key, writable = false) {
  if (!isAbsolute(path)) fail(key, 'must be absolute');
  try {
    if (!(await stat(path)).isDirectory()) fail(key, 'must be a directory');
    await access(path, constants.R_OK | constants.X_OK | (writable ? constants.W_OK : 0));
  } catch { fail(key, 'must already exist with required access'); }
}
const loopback = (host) => host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === '[::1]' || /^127\./.test(host) || host === '0.0.0.0';
function endpoint(value, key, protocols) {
  let url;
  try { url = new URL(value); } catch { fail(key, 'invalid endpoint'); }
  if (!protocols.includes(url.protocol) || !url.hostname || loopback(url.hostname)) fail(key, 'must use a reachable service host, not container localhost');
  return url;
}

export async function preflight(releasePath) {
  const release = await envFile(resolve(releasePath), 'release');
  for (const key of ['WEB_IMAGE', 'API_IMAGE', 'MIGRATION_IMAGE']) {
    const value = requireValue(release, key);
    if (!/^\S+(?::[^/:@\s]+|@sha256:[a-f0-9]{64})$/.test(value) || /:latest$/.test(value) || value.includes('$')) fail(key, 'must be a versioned image or digest');
  }
  for (const key of ['APP_ENV_FILE', 'UPLOAD_HOST_DIR', 'TLS_HOST_DIR']) {
    const value = requireValue(release, key);
    if (!isAbsolute(value) || /[$\r\n]/.test(value)) fail(key, 'must be an absolute literal path');
  }
  await directory(release.UPLOAD_HOST_DIR, 'UPLOAD_HOST_DIR', true);
  await directory(release.TLS_HOST_DIR, 'TLS_HOST_DIR');
  for (const file of ['fullchain.pem', 'privkey.pem']) {
    try {
      const path = resolve(release.TLS_HOST_DIR, file);
      if (!(await stat(path)).isFile()) fail('TLS_HOST_DIR', 'certificate files required');
      await access(path, constants.R_OK);
    } catch { fail('TLS_HOST_DIR', 'readable fullchain.pem and privkey.pem required'); }
  }
  const app = await envFile(release.APP_ENV_FILE, 'APP_ENV_FILE');
  if (app.NODE_ENV !== 'production') fail('NODE_ENV', 'must be production');
  if (app.BOOK_UPLOAD_DIR !== '/data/books') fail('BOOK_UPLOAD_DIR', 'must match /data/books mount');
  for (const origin of requireValue(app, 'CORS_ORIGINS').split(',')) {
    const url = endpoint(origin.trim(), 'CORS_ORIGINS', ['https:']);
    if (url.origin !== origin.trim() || url.username || url.password) fail('CORS_ORIGINS', 'must contain only HTTPS origins');
  }
  endpoint(requireValue(app, 'DATABASE_URL'), 'DATABASE_URL', ['postgresql:', 'postgres:']);
  const vectorAddress = requireValue(app, 'MILVUS_ADDRESS');
  const vectorUrl = endpoint(vectorAddress.includes('://') ? vectorAddress : `http://${vectorAddress}`, 'MILVUS_ADDRESS', ['http:', 'https:']);
  if (vectorUrl.pathname !== '/' || vectorUrl.search || vectorUrl.hash || vectorUrl.username || vectorUrl.password) fail('MILVUS_ADDRESS', 'use a service endpoint without paths or credentials');
  const secret = requireValue(app, 'JWT_ACCESS_SECRET');
  if (secret.length < 32 || /placeholder|change.?me|your.?secret/i.test(secret)) fail('JWT_ACCESS_SECRET', 'independent secret of at least 32 characters required');
  requireValue(app, 'OPENAI_API_KEY');
  if (app.OPENAI_BASE_URL) endpoint(app.OPENAI_BASE_URL, 'OPENAI_BASE_URL', ['https:', 'http:']);
  if (app.AUTH_PUBLIC_BASE_URL) endpoint(app.AUTH_PUBLIC_BASE_URL, 'AUTH_PUBLIC_BASE_URL', ['https:']);
  const mode = app.AGENT_ADMISSION_MODE || 'local';
  if (!['local', 'redis'].includes(mode)) fail('AGENT_ADMISSION_MODE', 'must be local or redis');
  if (mode === 'redis') endpoint(requireValue(app, 'REDIS_URL'), 'REDIS_URL', ['redis:', 'rediss:']);
  if (app.BOOK_MAX_UPLOAD_BYTES && (!/^\d+$/.test(app.BOOK_MAX_UPLOAD_BYTES) || Number(app.BOOK_MAX_UPLOAD_BYTES) > 60 * 1024 * 1024 || Number(app.BOOK_MAX_UPLOAD_BYTES) <= 0)) fail('BOOK_MAX_UPLOAD_BYTES', 'requires positive limit <= 60 MiB; otherwise review proxy limit');
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== '--release') throw new Error('usage: node deploy/preflight.mjs --release <file>');
    await preflight(process.argv[3]);
    console.log('PASS: deployment files checked; network, certificate validity and container UID access still require runtime verification');
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}
