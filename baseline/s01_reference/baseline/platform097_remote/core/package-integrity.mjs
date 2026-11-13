import { constants } from 'node:fs';
import { lstat, open, opendir, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

// This module belongs to the ALREADY TRUSTED host, never to a candidate loaded
// for verification. It reads bounded data only: no candidate imports, commands,
// ZIP extraction, installation, database opening or publisher authentication.
// The caller owns a private, quiescent staging directory. Windows deployment
// additionally checks all reparse-point types and alternate streams with its
// trusted native host. Node's lstat alone is not a complete NTFS stream policy.
// A receipt is an observation, not a lock: recheck under the installation guard
// immediately before activation. A same-user writer is not isolated by hashes.
export const RELEASE_PACKAGE_LIMITS = Object.freeze({
  metadataBytes: 64 * 1024,
  manifestBytes: 2 * 1024 * 1024,
  packageFiles: 4096, // Includes SOURCE-SHA256.txt.
  directoryEntries: 8192,
  fileBytes: 64 * 1024 * 1024,
  packageBytes: 256 * 1024 * 1024, // Includes the manifest, including its newline.
  pathDepth: 20,
  pathLength: 512
});

// Changing these anchors is a reviewed change to the trusted installer. The
// candidate runtime-release.json can describe them, never replace them.
export const RELEASE_RUNTIME_TRUST = Object.freeze({
  version: '24.22.2',
  source: 'https://nodejs.org/en/blog/release/v24.22.2',
  license: 'https://github.com/nodejs/node/blob/v24.22.2/LICENSE',
  windows: Object.freeze({
    x64: Object.freeze({
      url: 'https://nodejs.org/dist/v24.22.2/win-x64/node.exe',
      sha256: '1c331340fa6cac5e4294725959070a143fa0507195a78ad77eed7943f719aac9'
    }),
    arm64: Object.freeze({
      url: 'https://nodejs.org/dist/v24.22.2/win-arm64/node.exe',
      sha256: 'e2d6e75a0bfe4c176316d7c732eb8def9d94570c759eaeab335473a015abb7ea'
    })
  })
});

const MANIFEST = 'SOURCE-SHA256.txt';
const ROOT_FILES = new Set(['README_DE.md', 'Starten.cmd', 'Starten.sh', 'package.json', 'server.mjs', 'global.json', MANIFEST]);
const ROOT_DIRECTORIES = new Set(['adapters', 'core', 'docs', 'evidence', 'integrations', 'public', 'research', 'scripts', 'sdk', 'tests']);
const FORBIDDEN_DIRECTORIES = new Set(['bin', 'obj', 'node_modules', 'data', 'runtime', 'runtimecache', 'toolchains', 'backups', 'migration-backups', 'staging']);
const FORBIDDEN_FILES = new Set(['hub-connection.json', 'hub-state.json', 'hub-runtime-state.json', 'vault.json', 'owner.json', 'credentials.json', 'install-state.json', 'deploy-journal.json']);
const FORBIDDEN_EXTENSION = /\.(?:db|sqlite|sqlite3|key|pem|pfx|p12|exe|dll|msi|msix|appx|com|scr|sys|pdb|so|dylib|zip|7z|rar|tar|gz|tgz|xz|bz2|cab)$/i;
const BOT_ARTIFACTS = new Set([
  'integrations/ctrader-extremelab17/artifacts/ExtremeLabReady17Local.algo',
  'integrations/ctrader-observer20/artifacts/Th3RevolutionObserver20_2_0_0_alpha4.algo',
  'integrations/ctrader-th3revolution20/artifacts/Th3Revolution20_2_0_0_alpha5.algo'
]);
const REQUIRED_FILES = ['package.json', 'server.mjs', 'core/store.mjs', 'core/control.mjs', 'public/index.html', 'scripts/release.json', 'scripts/runtime-release.json'];
const PLATFORM_SET = new Set(['win32-x64', 'win32-arm64']);
const SHA256 = /^[a-f0-9]{64}$/;
const VERSION = /^(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5})$/;
const DEVICE_NAME = /^(?:CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(?:\.|$)/i;
const MESSAGES = Object.freeze({
  PACKAGE_ARGUMENTS: 'Die Angaben für die Paketprüfung sind ungültig.',
  PACKAGE_PATH: 'Das Paket enthält einen nicht zulässigen oder mehrdeutigen Dateipfad.',
  PACKAGE_CONTENT: 'Das Paket enthält nicht zulässige Programm-, Laufzeit- oder Zugangsdaten.',
  PACKAGE_LIMIT: 'Das Paket überschreitet die begrenzte Paketprüfung.',
  PACKAGE_UNSAFE_ENTRY: 'Das Paket oder sein Ablageort enthält einen Link oder einen nicht zulässigen Dateityp.',
  PACKAGE_MANIFEST: 'Die Paketprüfliste ist ungültig oder mehrdeutig.',
  PACKAGE_MANIFEST_MISMATCH: 'Paketinhalt und vollständige Paketprüfliste stimmen nicht überein.',
  PACKAGE_HASH_MISMATCH: 'Eine Paketdatei stimmt nicht mit ihrer Prüfsumme überein.',
  PACKAGE_CHANGED: 'Das Paket wurde während der Prüfung verändert.',
  PACKAGE_METADATA: 'Die erforderlichen Paketmetadaten sind ungültig.',
  PACKAGE_INCOMPATIBLE: 'Das Paket passt nicht zur Plattform, Laufzeit oder zum unterstützten Datenschema.',
  PACKAGE_RUNTIME_PIN: 'Die beschriebenen Laufzeitdateien stimmen nicht mit den festgelegten Vertrauensankern überein.',
  PACKAGE_UNAVAILABLE: 'Das Paket konnte nicht vollständig und sicher gelesen werden.'
});

export class ReleasePackageError extends Error {
  constructor(code) { super(MESSAGES[code]); this.name = 'ReleasePackageError'; this.code = code; this.status = 400; this.safe = true; }
}
function fail(code) { throw new ReleasePackageError(code); }
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => object(value) && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// Conservative Windows-compatible paths on every host. Native Windows checks
// also have to bound the FINAL absolute path (the staging prefix is not fixed).
export function validateReleasePath(value) {
  if (typeof value !== 'string' || !value || value.length > RELEASE_PACKAGE_LIMITS.pathLength ||
      !/^[A-Za-z0-9_][A-Za-z0-9_./-]*$/.test(value)) fail('PACKAGE_PATH');
  const parts = value.split('/');
  if (parts.length > RELEASE_PACKAGE_LIMITS.pathDepth || parts.some(part =>
    !part || part === '.' || part === '..' || part.startsWith('.') || part.endsWith('.') ||
    part.length > 255 || DEVICE_NAME.test(part))) fail('PACKAGE_PATH');
  return value;
}

function packageMember(path, directory = false) {
  validateReleasePath(path);
  const parts = path.split('/');
  if (parts.some(part => FORBIDDEN_DIRECTORIES.has(part.toLowerCase())) ||
      FORBIDDEN_FILES.has(parts.at(-1).toLowerCase()) || FORBIDDEN_EXTENSION.test(path) ||
      /-(?:wal|shm|journal)$/i.test(path) || /\.algo$/i.test(path) && !BOT_ARTIFACTS.has(path) ||
      parts[0] === 'evidence' && /\.(?:jpg|jpeg|png|webp|gif)$/i.test(path)) fail('PACKAGE_CONTENT');
  if (parts.length === 1 ? !(directory ? ROOT_DIRECTORIES : ROOT_FILES).has(path) : !ROOT_DIRECTORIES.has(parts[0])) fail('PACKAGE_CONTENT');
}

function manifestPaths(raw) {
  let text;
  try { text = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(raw); }
  catch { fail('PACKAGE_MANIFEST'); }
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  if (!lines.length || lines.length + 1 > RELEASE_PACKAGE_LIMITS.packageFiles) fail('PACKAGE_LIMIT');
  const files = new Map(), tree = new Map(), directories = new Set();
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match) fail('PACKAGE_MANIFEST');
    const [, digest, path] = match;
    packageMember(path);
    if (path === MANIFEST || files.has(path)) fail('PACKAGE_MANIFEST');
    const parts = path.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const name = parts.slice(0, i).join('/'), type = i === parts.length ? 'file' : 'directory', folded = name.toLowerCase(), prior = tree.get(folded);
      if (prior && (prior.name !== name || prior.type !== type || type === 'file')) fail('PACKAGE_MANIFEST');
      tree.set(folded, {name, type});
      if (type === 'directory') directories.add(name);
    }
    files.set(path, digest);
  }
  if (REQUIRED_FILES.some(path => !files.has(path))) fail('PACKAGE_MANIFEST_MISMATCH');
  return {files, directories};
}

// Native JSON.parse supplies the values. A separate bounded token walk rejects
// duplicate/case-colliding keys before another host (e.g. PowerShell) can give
// the same metadata a different meaning. It does not evaluate JSON as code.
function jsonMetadata(raw) {
  let source, value;
  try { source = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(raw); value = JSON.parse(source); }
  catch { fail('PACKAGE_METADATA'); }
  let offset = 0, tokens = 0;
  const whitespace = () => { while (/\s/.test(source[offset] || '') && offset < source.length) offset++; };
  function string() {
    const start = offset++;
    while (offset < source.length) {
      if (source[offset++] === '"') return JSON.parse(source.slice(start, offset));
      if (source[offset - 1] === '\\') offset++;
    }
    fail('PACKAGE_METADATA');
  }
  function walk(depth) {
    if (depth > 16 || ++tokens > 4096) fail('PACKAGE_METADATA');
    whitespace();
    const first = source[offset];
    if (first === '{') {
      offset++; whitespace(); const names = new Set();
      if (source[offset] === '}') { offset++; return; }
      for (;;) {
        whitespace(); const name = string(), folded = name.toLowerCase();
        if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(name) || names.has(folded)) fail('PACKAGE_METADATA');
        names.add(folded); whitespace(); offset++; walk(depth + 1); whitespace();
        if (source[offset++] === '}') return;
      }
    }
    if (first === '[') {
      offset++; whitespace();
      if (source[offset] === ']') { offset++; return; }
      for (;;) { walk(depth + 1); whitespace(); if (source[offset++] === ']') return; }
    }
    if (first === '"') { string(); return; }
    while (offset < source.length && !/[\s,\]}]/.test(source[offset])) offset++;
  }
  walk(0); whitespace();
  if (offset !== source.length || !object(value)) fail('PACKAGE_METADATA');
  return value;
}

function validateMetadata(packageBytes, releaseBytes, runtimeBytes, options) {
  const pkg = jsonMetadata(packageBytes), release = jsonMetadata(releaseBytes), runtime = jsonMetadata(runtimeBytes);
  const keys = ['format', 'schema', 'version', 'nodeMajor', 'dataSchema', 'platforms'];
  const migrateFrom = Object.hasOwn(release, 'migrateFrom') ? release.migrateFrom : [];
  if (!(exactKeys(release, keys) || exactKeys(release, [...keys, 'migrateFrom'])) ||
      release.format !== 'trading-local-release' || release.schema !== 1 || !VERSION.test(release.version || '') ||
      !exactKeys(release.dataSchema, ['readMin', 'readMax', 'write']) || !Array.isArray(release.platforms) ||
      !release.platforms.length || release.platforms.length > PLATFORM_SET.size || new Set(release.platforms).size !== release.platforms.length ||
      release.platforms.some(platform => !PLATFORM_SET.has(platform)) || !Array.isArray(migrateFrom) ||
      migrateFrom.length > 1 || migrateFrom.some(schema => schema !== 1)) fail('PACKAGE_METADATA');
  // This is the one existing, reviewed Store migration. It is a declared
  // future requirement, not direct Schema1 read compatibility or permission to
  // execute migration code from the candidate. Normal checks and rollback do
  // not opt in. The trusted Core must back up and migrate before opening data.
  const migration = {required: options.databaseSchemaVersion === 1 && options.allowMigration && migrateFrom.includes(1), from: null, to: 2};
  if (migration.required) migration.from = 1;
  if (pkg.name !== 'trading-local-core' || pkg.private !== true || pkg.type !== 'module' ||
      pkg.version !== release.version || !exactKeys(pkg.engines, ['node']) || pkg.engines.node !== '>=24.0.0 <25' ||
      release.nodeMajor !== 24 || Number(process.versions.node.split('.')[0]) !== 24 ||
      !release.platforms.includes(options.targetPlatform) ||
      !Object.values(release.dataSchema).every(number => number === 2) ||
      options.databaseSchemaVersion !== null && options.databaseSchemaVersion !== 2 && !migration.required) fail('PACKAGE_INCOMPATIBLE');
  if (!exactKeys(runtime, ['version', 'verifiedOn', 'source', 'license', 'windows']) ||
      runtime.version !== RELEASE_RUNTIME_TRUST.version || runtime.source !== RELEASE_RUNTIME_TRUST.source ||
      runtime.license !== RELEASE_RUNTIME_TRUST.license || !/^\d{4}-\d\d-\d\d$/.test(runtime.verifiedOn || '') ||
      !exactKeys(runtime.windows, ['x64', 'arm64'])) fail('PACKAGE_RUNTIME_PIN');
  for (const architecture of ['x64', 'arm64']) {
    const described = runtime.windows[architecture], trusted = RELEASE_RUNTIME_TRUST.windows[architecture];
    if (!exactKeys(described, ['url', 'sha256']) || described.url !== trusted.url || described.sha256 !== trusted.sha256) fail('PACKAGE_RUNTIME_PIN');
  }
  return {release, migration};
}

function sameIdentity(a, b) {
  return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode && a.uid === b.uid && a.gid === b.gid;
}
function sameSnapshot(a, b) {
  return sameIdentity(a, b) && a.nlink === b.nlink && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}
function regularFile(info) {
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1n) fail('PACKAGE_UNSAFE_ENTRY');
}
async function stat(path) { return lstat(path, {bigint: true}); }
function within(root, path) {
  const result = relative(root, path);
  if (isAbsolute(result) || result === '..' || result.startsWith('..' + sep)) fail('PACKAGE_UNSAFE_ENTRY');
}
async function rootComponents(root) {
  const paths = []; let current = root;
  for (;;) { paths.push(current); const parent = dirname(current); if (parent === current) break; current = parent; }
  const observed = [];
  for (const path of paths.reverse()) {
    const info = await stat(path);
    if (!info.isDirectory() || info.isSymbolicLink()) fail('PACKAGE_UNSAFE_ENTRY');
    observed.push({path, info});
  }
  return observed;
}

async function inventory(root, rootStat) {
  const files = new Map(), directories = new Map([['', rootStat]]), folded = new Set();
  let entries = 0, bytes = 0;
  async function walk(directory, prefix) {
    const before = await stat(directory);
    if (!before.isDirectory() || before.isSymbolicLink()) fail('PACKAGE_UNSAFE_ENTRY');
    within(root, await realpath(directory));
    if (!sameSnapshot(before, directories.get(prefix))) fail('PACKAGE_CHANGED');
    const stream = await opendir(directory);
    for await (const entry of stream) {
      if (++entries > RELEASE_PACKAGE_LIMITS.directoryEntries) fail('PACKAGE_LIMIT');
      const name = prefix ? prefix + '/' + entry.name : entry.name, path = join(directory, entry.name);
      validateReleasePath(name);
      if (folded.has(name.toLowerCase())) fail('PACKAGE_PATH');
      folded.add(name.toLowerCase());
      const info = await stat(path);
      if (info.isSymbolicLink()) fail('PACKAGE_UNSAFE_ENTRY');
      packageMember(name, info.isDirectory());
      if (info.isDirectory()) {
        directories.set(name, info); await walk(path, name);
      } else {
        regularFile(info);
        const maximum = name === MANIFEST ? RELEASE_PACKAGE_LIMITS.manifestBytes : RELEASE_PACKAGE_LIMITS.fileBytes;
        if (info.size > BigInt(maximum)) fail('PACKAGE_LIMIT');
        files.set(name, info); bytes += Number(info.size);
        if (files.size > RELEASE_PACKAGE_LIMITS.packageFiles || bytes > RELEASE_PACKAGE_LIMITS.packageBytes) fail('PACKAGE_LIMIT');
      }
    }
    if (!sameSnapshot(before, await stat(directory))) fail('PACKAGE_CHANGED');
  }
  await walk(root, '');
  return {files, directories, bytes};
}

// Deliberately bounded, known secret patterns, not a complete secret scan.
// The overlap covers short matches across read boundaries. An intentionally
// bundled .algo is binary manufacturer content, checked by hash, not decoded.
function secretPattern(text) {
  if (/\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{30}/.test(text) ||
    /\bxox[baprs]-[A-Za-z0-9-]{20}/.test(text) || /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/.test(text) ||
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) return true;
  // Consume a URL token once, then inspect its query. A repeated scheme in a
  // long token must not cause quadratic retries over the whole read buffer.
  for (const url of text.matchAll(/https?:\/\/[^\s"<>]+/gi)) {
    if (/[?&](?:_vercel_share|x-vercel-protection-bypass|token|sig|signature|secret)=[^\s"<>]/i.test(url[0])) return true;
  }
  return false;
}

async function readFileBounded(root, name, expected, maximum, {collect = false, contentCheck = true} = {}) {
  const path = join(root, name), before = await stat(path);
  regularFile(before);
  if (before.size > BigInt(maximum)) fail('PACKAGE_LIMIT');
  if (expected && !sameSnapshot(before, expected)) fail('PACKAGE_CHANGED');
  within(root, await realpath(path));
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
  try {
    const opened = await handle.stat({bigint: true}); regularFile(opened);
    if (!sameSnapshot(before, opened)) fail('PACKAGE_CHANGED');
    const digest = createHash('sha256'), chunks = [], buffer = Buffer.allocUnsafe(65536);
    let bytes = 0, overlap = '';
    for (;;) {
      const {bytesRead} = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      bytes += bytesRead;
      if (bytes > maximum) fail('PACKAGE_LIMIT');
      const chunk = buffer.subarray(0, bytesRead); digest.update(chunk);
      if (collect) chunks.push(Buffer.from(chunk));
      if (contentCheck && !BOT_ARTIFACTS.has(name)) {
        if (bytes === bytesRead && chunk.subarray(0, 16).equals(Buffer.from('SQLite format 3\0'))) fail('PACKAGE_CONTENT');
        const text = overlap + chunk.toString('latin1');
        if (secretPattern(text)) fail('PACKAGE_CONTENT');
        overlap = text.slice(-8192);
      }
    }
    if (bytes !== Number(before.size) || !sameSnapshot(before, await handle.stat({bigint: true})) ||
        !sameSnapshot(before, await stat(path))) fail('PACKAGE_CHANGED');
    within(root, await realpath(path));
    return {sha256: digest.digest('hex'), bytes, info: before, ...(collect ? {raw: Buffer.concat(chunks, bytes)} : {})};
  } finally { await handle.close(); }
}

function optionsFor(directory, input) {
  if (typeof directory !== 'string' || !directory || directory.length > 4096 || directory.includes('\0') || !isAbsolute(directory) ||
      !object(input) || !Object.hasOwn(input, 'databaseSchemaVersion') || !PLATFORM_SET.has(input.targetPlatform) ||
      input.databaseSchemaVersion !== null && (!Number.isSafeInteger(input.databaseSchemaVersion) || input.databaseSchemaVersion < 0) ||
      input.allowMigration !== undefined && typeof input.allowMigration !== 'boolean' ||
      input.expectedManifestSha256 !== undefined && (typeof input.expectedManifestSha256 !== 'string' || !SHA256.test(input.expectedManifestSha256))) fail('PACKAGE_ARGUMENTS');
  if (process.platform === 'win32' && (!/^[A-Za-z]:[\\/]/.test(directory) || directory.slice(2).includes(':'))) fail('PACKAGE_PATH');
  return {targetPlatform: input.targetPlatform, databaseSchemaVersion: input.databaseSchemaVersion, expectedManifestSha256: input.expectedManifestSha256, allowMigration: input.allowMigration === true};
}

/** Inspect a complete, unpacked release directory using only trusted host code.
 * Missing manifest is an error. No files, permissions or timestamps are set.
 * Publisher authentication, NTFS ADS/reparse policy, ZIP parsing and activation
 * are intentionally outside this receipt. No candidate script is executed.
 */
export async function inspectReleaseDirectory(directory, input) {
  try {
    const options = optionsFor(directory, input), root = resolve(directory), ancestors = await rootComponents(root);
    const rootStat = ancestors.at(-1).info, first = await inventory(root, rootStat);
    if (!first.files.has(MANIFEST)) fail('PACKAGE_MANIFEST_MISMATCH');
    const manifest = await readFileBounded(root, MANIFEST, first.files.get(MANIFEST), RELEASE_PACKAGE_LIMITS.manifestBytes, {collect: true, contentCheck: false});
    if (options.expectedManifestSha256 !== undefined && manifest.sha256 !== options.expectedManifestSha256) fail('PACKAGE_HASH_MISMATCH');
    const expected = manifestPaths(manifest.raw);
    if (first.files.size !== expected.files.size + 1 || [...first.files.keys()].some(path => path !== MANIFEST && !expected.files.has(path)) ||
        first.directories.size !== expected.directories.size + 1 || [...first.directories.keys()].some(path => path && !expected.directories.has(path))) fail('PACKAGE_MANIFEST_MISMATCH');
    const metadata = new Map(); let totalBytes = manifest.bytes;
    for (const name of [...expected.files.keys()].sort()) {
      const isMetadata = ['package.json', 'scripts/release.json', 'scripts/runtime-release.json'].includes(name);
      const maximum = Math.min(isMetadata ? RELEASE_PACKAGE_LIMITS.metadataBytes : RELEASE_PACKAGE_LIMITS.fileBytes, RELEASE_PACKAGE_LIMITS.packageBytes - totalBytes);
      const inspected = await readFileBounded(root, name, first.files.get(name), maximum, {collect: isMetadata});
      if (inspected.sha256 !== expected.files.get(name)) fail('PACKAGE_HASH_MISMATCH');
      totalBytes += inspected.bytes;
      if (isMetadata) metadata.set(name, inspected.raw);
    }
    const {release, migration} = validateMetadata(metadata.get('package.json'), metadata.get('scripts/release.json'), metadata.get('scripts/runtime-release.json'), options);
    const again = await readFileBounded(root, MANIFEST, manifest.info, RELEASE_PACKAGE_LIMITS.manifestBytes, {contentCheck: false});
    if (again.sha256 !== manifest.sha256) fail('PACKAGE_CHANGED');
    const final = await inventory(root, rootStat);
    if (final.bytes !== first.bytes || final.files.size !== first.files.size || final.directories.size !== first.directories.size) fail('PACKAGE_CHANGED');
    for (const [path, info] of first.files) if (!final.files.has(path) || !sameSnapshot(info, final.files.get(path))) fail('PACKAGE_CHANGED');
    for (const [path, info] of first.directories) if (!final.directories.has(path) || !sameSnapshot(info, final.directories.get(path))) fail('PACKAGE_CHANGED');
    for (const observed of ancestors) {
      const current = await stat(observed.path);
      if (!current.isDirectory() || current.isSymbolicLink() || !sameIdentity(current, observed.info)) fail('PACKAGE_CHANGED');
    }
    return {
      format: 'trading-local-package-inspection', schema: 1,
      version: release.version, manifestSha256: manifest.sha256,
      manifestEntries: expected.files.size, totalBytes,
      nodeMajor: 24, dataSchema: {...release.dataSchema}, platforms: [...release.platforms], migration,
      integrity: 'verified', publisher: 'unverified', automaticUpdateAllowed: false
    };
  } catch (error) {
    if (error instanceof ReleasePackageError) throw error;
    fail('PACKAGE_UNAVAILABLE');
  }
}
