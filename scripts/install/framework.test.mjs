import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  assertCandidateUnchanged,
  assertDeltaAllowed,
  assertExactCleanRepo,
  assertRawPromotionIdentity,
  assertSafeRelative,
  computeCandidateDelta,
  materializeWorkingTree,
  migrateIntegrityForPhase,
  parseRepoArgument,
  promoteTransactional,
  rawSha256Bytes,
  snapshotCandidate,
  validatePhaseDescriptor,
  run,
  runDefaultGates,
} from './framework.mjs';
import { canonicalSha256Bytes } from '../repo/integrity.mjs';

function tempDir(prefix = 'rbrwx-installer-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
async function write(root, relative, data) {
  const file = path.join(root, ...relative.split('/'));
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, data);
  return file;
}
function git(repo, args) {
  return run('git', ['-C', repo, ...args], { capture: true });
}
async function initRepo() {
  const root = tempDir();
  run('git', ['init', root], { capture: true });
  git(root, ['config', 'user.email', 'test@example.invalid']);
  git(root, ['config', 'user.name', 'RBRWX Test']);
  git(root, ['config', 'core.autocrlf', 'false']);
  await write(root, 'tracked.txt', 'base\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'base'], { capture: true });
  const head = git(root, ['rev-parse', 'HEAD']).stdout.trim();
  return { root, head };
}
async function makeManifestStage() {
  const stage = tempDir();
  await write(stage, 'old.txt', 'old\n');
  await write(stage, 'delete.txt', 'delete\n');
  await write(stage, 'new.txt', 'new\r\n');
  const foundation = {
    schema: 1,
    release: 'foundation-test',
    files: {
      'old.txt': canonicalSha256Bytes(Buffer.from('old\n'), 'old.txt'),
      'delete.txt': canonicalSha256Bytes(Buffer.from('delete\n'), 'delete.txt'),
    },
  };
  const empty = release => ({ schema: 1, release, files: {} });
  await write(stage, 'scripts/foundation-file-manifest.json', `${JSON.stringify(foundation, null, 2)}\n`);
  await write(stage, 'scripts/broadcast/broadcast-package-file-manifest.json', `${JSON.stringify(empty('broadcast-test'), null, 2)}\n`);
  await write(stage, 'scripts/current-weather/payload-manifest.json', `${JSON.stringify(empty('current-test'), null, 2)}\n`);
  await write(stage, 'scripts/forecast-graphics/payload-manifest.json', `${JSON.stringify(empty('forecast-test'), null, 2)}\n`);
  await write(stage, 'scripts/qpf/payload-manifest.json', `${JSON.stringify(empty('qpf-test'), null, 2)}\n`);
  const descriptor = {
    manifests: [
      'scripts/foundation-file-manifest.json',
      'scripts/broadcast/broadcast-package-file-manifest.json',
      'scripts/current-weather/payload-manifest.json',
      'scripts/forecast-graphics/payload-manifest.json',
      'scripts/qpf/payload-manifest.json',
    ],
    manifestContracts: {
      'scripts/foundation-file-manifest.json': { schema: 1, release: 'foundation-test', baseEntryCount: 2 },
      'scripts/broadcast/broadcast-package-file-manifest.json': { schema: 1, release: 'broadcast-test', baseEntryCount: 0 },
      'scripts/current-weather/payload-manifest.json': { schema: 1, release: 'current-test', baseEntryCount: 0 },
      'scripts/forecast-graphics/payload-manifest.json': { schema: 1, release: 'forecast-test', baseEntryCount: 0 },
      'scripts/qpf/payload-manifest.json': { schema: 1, release: 'qpf-test', baseEntryCount: 0 },
    },
    newOwnership: { 'new.txt': 'scripts/foundation-file-manifest.json' },
  };
  return { stage, descriptor };
}

test('repository-relative path guard rejects traversal, absolute and drive paths', () => {
  for (const bad of ['../x', 'a/../b', '/abs', 'C:/x', 'a//b', '././x']) assert.throws(() => assertSafeRelative(bad));
  assert.equal(assertSafeRelative('scripts/install/framework.mjs'), 'scripts/install/framework.mjs');
});

test('canonical integrity dependency treats CRLF/LF text equally while raw bytes differ', () => {
  const lf = Buffer.from('a\nb\n');
  const crlf = Buffer.from('a\r\nb\r\n');
  assert.equal(canonicalSha256Bytes(lf, 'x.txt'), canonicalSha256Bytes(crlf, 'x.txt'));
  assert.notEqual(rawSha256Bytes(lf), rawSha256Bytes(crlf));
});

test('CLI parser requires exactly one --repo argument', () => {
  assert.equal(parseRepoArgument(['--repo', 'C:/repo']), 'C:/repo');
  assert.throws(() => parseRepoArgument([]));
  assert.throws(() => parseRepoArgument(['--repo', 'a', '--repo', 'b']));
});

test('child node --test execution is isolated from a parent Node test context', async () => {
  const root = tempDir();
  try {
    await write(root, 'child.test.mjs', "import { test } from 'node:test'; import assert from 'node:assert/strict'; test('child-ran', () => assert.equal(2 + 2, 4));\n");
    const result = run('node', ['--test', 'child.test.mjs'], { cwd: root, capture: true });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /child-ran/);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /skipping running files|run\(\) is being called recursively/i);
  } finally { await fsp.rm(root, { recursive: true, force: true }); }
});

test('descriptor validation verifies declared payload only and ignores stale undeclared files', async () => {
  const pkg = tempDir();
  try {
    await write(pkg, 'payload/new.txt', 'hello\n');
    await write(pkg, 'payload/stale-old-package.txt', 'ignore me');
    const digest = rawSha256Bytes(Buffer.from('hello\n'));
    const descriptor = {
      schema: 1,
      phase: 'test-phase',
      acceptedBase: '1'.repeat(40),
      payloadFiles: { 'new.txt': digest },
      deletePaths: [],
      manifests: ['scripts/foundation-file-manifest.json'],
      manifestContracts: { 'scripts/foundation-file-manifest.json': { schema: 1, release: 'x', baseEntryCount: 0 } },
      newOwnership: { 'new.txt': 'scripts/foundation-file-manifest.json' },
    };
    const result = await validatePhaseDescriptor(pkg, descriptor);
    assert.deepEqual(result.payloadPaths, ['new.txt']);
  } finally { await fsp.rm(pkg, { recursive: true, force: true }); }
});

test('descriptor validation forbids precomputed integrity manifests in payload', async () => {
  const pkg = tempDir();
  try {
    const relative = 'scripts/foundation-file-manifest.json';
    await write(pkg, `payload/${relative}`, '{}\n');
    const descriptor = {
      schema: 1,
      phase: 'test-phase', acceptedBase: '1'.repeat(40),
      payloadFiles: { [relative]: rawSha256Bytes(Buffer.from('{}\n')) },
      manifests: [relative],
      manifestContracts: { [relative]: { schema: 1, release: 'x', baseEntryCount: 0 } },
    };
    await assert.rejects(validatePhaseDescriptor(pkg, descriptor), /must be migrated in staging/);
  } finally { await fsp.rm(pkg, { recursive: true, force: true }); }
});

test('exact repo preflight enforces Git root, exact base and clean tree', async () => {
  const { root, head } = await initRepo();
  try {
    assert.equal(await assertExactCleanRepo(root, head, { verifyIntegrity: false }), await fsp.realpath(root));
    await assert.rejects(assertExactCleanRepo(root, '2'.repeat(40), { verifyIntegrity: false }), /Expected exact accepted base/);
    await write(root, 'dirty.txt', 'dirty');
    await assert.rejects(assertExactCleanRepo(root, head, { verifyIntegrity: false }), /not clean/);
  } finally { await fsp.rm(root, { recursive: true, force: true }); }
});

test('working-tree staging copies current bytes, not Git blob bytes', async () => {
  const { root } = await initRepo();
  const stage = tempDir();
  try {
    await fsp.writeFile(path.join(root, 'tracked.txt'), 'base\r\n');
    await materializeWorkingTree(root, stage);
    assert.equal(await fsp.readFile(path.join(stage, 'tracked.txt'), 'utf8'), 'base\r\n');
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
    await fsp.rm(stage, { recursive: true, force: true });
  }
});

test('phase ownership migration rehashes existing files, adds new ownership, and removes deleted ownership', async () => {
  const { stage, descriptor } = await makeManifestStage();
  try {
    await fsp.rm(path.join(stage, 'delete.txt'));
    const touched = await migrateIntegrityForPhase(stage, descriptor, ['old.txt', 'new.txt'], ['delete.txt']);
    assert.deepEqual(touched, ['scripts/foundation-file-manifest.json']);
    const manifest = JSON.parse(await fsp.readFile(path.join(stage, 'scripts/foundation-file-manifest.json'), 'utf8'));
    assert.deepEqual(Object.keys(manifest.files), ['new.txt', 'old.txt']);
    assert.equal(manifest.files['new.txt'], canonicalSha256Bytes(Buffer.from('new\n'), 'new.txt'));
  } finally { await fsp.rm(stage, { recursive: true, force: true }); }
});

test('new payload files require explicit manifest ownership', async () => {
  const { stage, descriptor } = await makeManifestStage();
  try {
    descriptor.newOwnership = {};
    await assert.rejects(migrateIntegrityForPhase(stage, descriptor, ['new.txt'], []), /no declared manifest owner/);
  } finally { await fsp.rm(stage, { recursive: true, force: true }); }
});

test('candidate source snapshot ignores generated build outputs but detects source mutation', async () => {
  const root = tempDir();
  try {
    await write(root, 'src/a.txt', 'one');
    const before = await snapshotCandidate(root);
    await write(root, 'dist/generated.js', 'ignored');
    await write(root, 'src-tauri/target/debug/x', 'ignored');
    await write(root, 'tsconfig.app.tsbuildinfo', 'ignored');
    await assertCandidateUnchanged(root, before);
    await write(root, 'src/a.txt', 'two');
    await assert.rejects(assertCandidateUnchanged(root, before), /mutated candidate source/);
  } finally { await fsp.rm(root, { recursive: true, force: true }); }
});



test('default gates emit the exact deterministic npm, Cargo, and Tauri command contract', () => {
  const calls = [];
  const runner = (command, args, options) => { calls.push({ command, args, cwd: options?.cwd }); return { status: 0 }; };
  runDefaultGates('C:/synthetic-stage', runner);
  assert.deepEqual(calls, [
    { command: 'npm', args: ['ci', '--no-audit', '--no-fund'], cwd: 'C:/synthetic-stage' },
    { command: 'npm', args: ['run', 'verify'], cwd: 'C:/synthetic-stage' },
    { command: 'cargo', args: ['check', '--locked', '--manifest-path', 'src-tauri/Cargo.toml'], cwd: 'C:/synthetic-stage' },
    { command: 'npm', args: ['run', 'tauri', '--', 'build', '--no-bundle'], cwd: 'C:/synthetic-stage' },
  ]);
});

test('candidate delta reports new/changed/deleted tracked files and boundary rejects undeclared changes', async () => {
  const { root } = await initRepo();
  const stage = tempDir();
  try {
    await materializeWorkingTree(root, stage);
    await write(stage, 'tracked.txt', 'changed\n');
    await write(stage, 'new.txt', 'new\n');
    const delta = await computeCandidateDelta(root, stage);
    assert.deepEqual(delta.changed, ['new.txt', 'tracked.txt']);
    assertDeltaAllowed(delta, ['tracked.txt', 'new.txt'], [], []);
    assert.throws(() => assertDeltaAllowed(delta, ['tracked.txt'], [], []), /escaped declared phase boundary/);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
    await fsp.rm(stage, { recursive: true, force: true });
  }
});

test('transactional promotion restores replacements and deletions after post-promotion failure', async () => {
  const temp = tempDir(); const stage = path.join(temp, 'stage'); const repo = path.join(temp, 'repo');
  await fsp.mkdir(stage, { recursive: true }); await fsp.mkdir(repo, { recursive: true });
  try {
    await write(stage, 'x.txt', 'new\n'); await write(repo, 'x.txt', 'old\r\n'); await write(repo, 'delete.txt', 'keep');
    await assert.rejects(promoteTransactional({ stageRoot: stage, repoRoot: repo, promotePaths: ['x.txt'], deletePaths: ['delete.txt'], phase: 'test', verify: async () => { throw new Error('stop'); } }));
    assert.equal(await fsp.readFile(path.join(repo, 'x.txt'), 'utf8'), 'old\r\n');
    assert.equal(await fsp.readFile(path.join(repo, 'delete.txt'), 'utf8'), 'keep');
  } finally { await fsp.rm(temp, { recursive: true, force: true }); }
});

test('transactional promotion preserves exact raw staged bytes on success', async () => {
  const temp = tempDir(); const stage = path.join(temp, 'stage'); const repo = path.join(temp, 'repo');
  await fsp.mkdir(stage, { recursive: true }); await fsp.mkdir(repo, { recursive: true });
  try {
    const bytes = Buffer.from('new\n');
    await write(stage, 'x.txt', bytes); await write(repo, 'x.txt', 'old\r\n');
    await promoteTransactional({ stageRoot: stage, repoRoot: repo, promotePaths: ['x.txt'], deletePaths: [], phase: 'test', verify: async () => assertRawPromotionIdentity(stage, repo, ['x.txt']) });
    assert.deepEqual(await fsp.readFile(path.join(repo, 'x.txt')), bytes);
  } finally { await fsp.rm(temp, { recursive: true, force: true }); }
});
