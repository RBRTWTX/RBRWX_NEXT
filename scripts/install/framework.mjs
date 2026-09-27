import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { canonicalSha256File } from '../repo/integrity.mjs';

export const DEFAULT_MANIFESTS = Object.freeze([
  'scripts/foundation-file-manifest.json',
  'scripts/broadcast/broadcast-package-file-manifest.json',
  'scripts/current-weather/payload-manifest.json',
  'scripts/forecast-graphics/payload-manifest.json',
  'scripts/qpf/payload-manifest.json',
]);

export const GENERATED_PATHS = Object.freeze([
  'tsconfig.app.tsbuildinfo',
  'tsconfig.node.tsbuildinfo',
  'src-tauri/gen',
]);

const GENERATED_PREFIXES = Object.freeze(['node_modules/', 'dist/', 'src-tauri/target/', 'src-tauri/gen/']);

export function rawSha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function rawSha256File(file) {
  return rawSha256Bytes(fs.readFileSync(file));
}

export function normalizeRelative(value) {
  return String(value).replaceAll('\\', '/').replace(/^\.\//, '');
}

export function assertSafeRelative(value) {
  const relative = normalizeRelative(value);
  if (!relative || relative.startsWith('/') || /^[A-Za-z]:\//.test(relative)) {
    throw new Error(`Unsafe repository-relative path: ${value}`);
  }
  if (relative.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Unsafe repository-relative path: ${value}`);
  }
  return relative;
}

export function resolveCommand(command, args = []) {
  if (process.platform === 'win32' && ['npm', 'npx'].includes(command)) {
    return { executable: process.env.ComSpec || 'cmd.exe', args: ['/d', '/c', command, ...args] };
  }
  return { executable: command, args };
}

export function run(command, args = [], options = {}) {
  const resolved = resolveCommand(command, args);
  const env = { ...(options.env ?? process.env) };
  if (command === 'node' && args.includes('--test')) delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(resolved.executable, resolved.args, {
    cwd: options.cwd,
    encoding: options.encoding ?? 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    shell: false,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
    env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    const detail = options.capture ? `\n${result.stdout ?? ''}${result.stderr ?? ''}` : '';
    throw new Error(`${command} ${args.join(' ')} exited with code ${String(result.status)}.${detail}`);
  }
  return result;
}

export function git(repoRoot, args, options = {}) {
  return run('git', ['-C', repoRoot, ...args], options);
}

export function parseRepoArgument(argv = process.argv.slice(2)) {
  const index = argv.indexOf('--repo');
  if (index < 0 || !argv[index + 1]) throw new Error('Usage requires --repo <repository-root>.');
  if (argv.filter(value => value === '--repo').length !== 1) throw new Error('--repo must be supplied exactly once.');
  return argv[index + 1];
}

function isGenerated(relative) {
  const normalized = normalizeRelative(relative);
  if (normalized.endsWith('.tsbuildinfo')) return true;
  return GENERATED_PREFIXES.some(prefix => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix));
}

async function readJson(file) {
  return JSON.parse(await fsp.readFile(file, 'utf8'));
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function validatePhaseDescriptor(packageRoot, descriptor) {
  if (!descriptor || descriptor.schema !== 1) throw new Error('Installer phase descriptor schema must be 1.');
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(String(descriptor.phase ?? ''))) throw new Error('Installer phase id is invalid.');
  if (!/^[a-f0-9]{40}$/i.test(String(descriptor.acceptedBase ?? ''))) throw new Error('Installer acceptedBase must be a full 40-character Git SHA.');
  if (!descriptor.payloadFiles || typeof descriptor.payloadFiles !== 'object' || Array.isArray(descriptor.payloadFiles)) throw new Error('Installer payloadFiles must be an object.');

  const manifests = (descriptor.manifests ?? DEFAULT_MANIFESTS).map(assertSafeRelative);
  if (new Set(manifests).size !== manifests.length) throw new Error('Installer manifest list contains duplicates.');
  for (const relative of manifests) {
    if (Object.prototype.hasOwnProperty.call(descriptor.payloadFiles, relative)) {
      throw new Error(`Repository integrity manifest must be migrated in staging, not shipped as payload: ${relative}`);
    }
  }

  const payloadRoot = path.join(packageRoot, 'payload');
  const payloadPaths = [];
  for (const [rawRelative, expectedRaw] of Object.entries(descriptor.payloadFiles).sort(([a], [b]) => a.localeCompare(b))) {
    const relative = assertSafeRelative(rawRelative);
    if (!/^[a-f0-9]{64}$/i.test(String(expectedRaw))) throw new Error(`Invalid payload SHA-256 for ${relative}.`);
    const source = path.join(payloadRoot, ...relative.split('/'));
    if (!fs.existsSync(source) || !(await fsp.stat(source)).isFile()) throw new Error(`Declared payload file missing: ${relative}`);
    const actual = rawSha256File(source);
    if (actual !== String(expectedRaw).toLowerCase()) throw new Error(`Payload SHA-256 mismatch for ${relative}: expected ${expectedRaw}, got ${actual}.`);
    payloadPaths.push(relative);
  }
  if (!payloadPaths.length) throw new Error('Installer payload is empty.');

  const deletePaths = (descriptor.deletePaths ?? []).map(assertSafeRelative);
  if (new Set(deletePaths).size !== deletePaths.length) throw new Error('Installer deletePaths contains duplicates.');
  const newOwnership = descriptor.newOwnership ?? {};
  for (const [rawRelative, rawManifest] of Object.entries(newOwnership)) {
    const relative = assertSafeRelative(rawRelative);
    const manifest = assertSafeRelative(rawManifest);
    if (!payloadPaths.includes(relative)) throw new Error(`newOwnership target is not a declared payload file: ${relative}`);
    if (!manifests.includes(manifest)) throw new Error(`newOwnership references unknown manifest ${manifest}.`);
  }
  for (const relative of payloadPaths) {
    if (deletePaths.includes(relative)) throw new Error(`Payload and delete path overlap: ${relative}`);
  }

  const contracts = descriptor.manifestContracts ?? {};
  for (const manifest of manifests) {
    const contract = contracts[manifest];
    if (!contract || contract.schema !== 1 || typeof contract.release !== 'string' || !Number.isInteger(contract.baseEntryCount)) {
      throw new Error(`Missing or invalid manifest contract for ${manifest}.`);
    }
  }
  return { payloadRoot, payloadPaths, deletePaths, manifests };
}

export async function assertExactCleanRepo(repoArg, acceptedBase, options = {}) {
  const repoRoot = await fsp.realpath(path.resolve(repoArg));
  const top = git(repoRoot, ['rev-parse', '--show-toplevel'], { capture: true }).stdout.trim();
  if (path.resolve(top).toLowerCase() !== path.resolve(repoRoot).toLowerCase()) throw new Error(`--repo must be the Git root. Git reports ${top}`);
  const head = git(repoRoot, ['rev-parse', 'HEAD'], { capture: true }).stdout.trim();
  if (head !== acceptedBase) throw new Error(`Expected exact accepted base ${acceptedBase}; found ${head}.`);
  const dirty = git(repoRoot, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { capture: true }).stdout;
  if (dirty.length) throw new Error('Working tree is not clean. Commit, discard, or move local changes before installation.');
  const major = Number(process.versions.node.split('.')[0]);
  if (!Number.isInteger(major) || major < 22 || major >= 25) throw new Error(`Node 22-24 required; found ${process.version}.`);
  if (options.verifyIntegrity !== false) run('node', ['scripts/repo/verify-integrity.mjs'], { cwd: repoRoot });
  return repoRoot;
}

export async function materializeWorkingTree(repoRoot, stageRoot) {
  await fsp.rm(stageRoot, { recursive: true, force: true });
  await fsp.mkdir(stageRoot, { recursive: true });
  const tracked = git(repoRoot, ['ls-files', '-z'], { capture: true }).stdout.split('\0').filter(Boolean).map(assertSafeRelative);
  for (const relative of tracked) {
    const source = path.join(repoRoot, ...relative.split('/'));
    if (!fs.existsSync(source) || !(await fsp.stat(source)).isFile()) throw new Error(`Tracked working-tree file missing: ${relative}`);
    const destination = path.join(stageRoot, ...relative.split('/'));
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    await fsp.copyFile(source, destination);
  }
  return tracked;
}

export async function applyDeclaredPayload(packageRoot, stageRoot, descriptor) {
  const copied = [];
  const payloadRoot = path.join(packageRoot, 'payload');
  for (const [rawRelative, expectedRaw] of Object.entries(descriptor.payloadFiles).sort(([a], [b]) => a.localeCompare(b))) {
    const relative = assertSafeRelative(rawRelative);
    const source = path.join(payloadRoot, ...relative.split('/'));
    const bytes = await fsp.readFile(source);
    const actual = rawSha256Bytes(bytes);
    if (actual !== String(expectedRaw).toLowerCase()) throw new Error(`Payload changed after package validation: ${relative}`);
    const destination = path.join(stageRoot, ...relative.split('/'));
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    await fsp.writeFile(destination, bytes);
    copied.push(relative);
  }
  return copied;
}

export async function applyDeclaredDeletes(stageRoot, deletePaths) {
  for (const rawRelative of deletePaths) {
    const relative = assertSafeRelative(rawRelative);
    const target = path.join(stageRoot, ...relative.split('/'));
    if (!fs.existsSync(target)) continue;
    const stat = await fsp.stat(target);
    if (!stat.isFile()) throw new Error(`Declared delete path is not a file: ${relative}`);
    await fsp.rm(target, { force: true });
  }
}

async function loadManifestModels(stageRoot, descriptor) {
  const manifests = (descriptor.manifests ?? DEFAULT_MANIFESTS).map(assertSafeRelative);
  const models = new Map();
  for (const relative of manifests) {
    const contract = descriptor.manifestContracts[relative];
    const manifestPath = path.join(stageRoot, ...relative.split('/'));
    if (!fs.existsSync(manifestPath) || !(await fsp.stat(manifestPath)).isFile()) throw new Error(`Candidate manifest missing: ${relative}`);
    const model = await readJson(manifestPath);
    if (model.schema !== contract.schema || model.release !== contract.release || !model.files || typeof model.files !== 'object' || Array.isArray(model.files)) {
      throw new Error(`Manifest identity drift before phase migration: ${relative}`);
    }
    const count = Object.keys(model.files).length;
    if (count !== contract.baseEntryCount) throw new Error(`${relative} expected ${contract.baseEntryCount} accepted-base entries; found ${count}.`);
    models.set(relative, model);
  }
  return models;
}

function buildOwnership(models) {
  const claims = new Map();
  for (const [manifest, model] of models) {
    for (const rawRelative of Object.keys(model.files)) {
      const relative = assertSafeRelative(rawRelative);
      if (!claims.has(relative)) claims.set(relative, []);
      claims.get(relative).push(manifest);
    }
  }
  const duplicates = [...claims.entries()].filter(([, owners]) => owners.length > 1);
  if (duplicates.length) {
    throw new Error(`Accepted-base manifest ownership is not single-owner: ${duplicates.map(([file, owners]) => `${file} => ${owners.join(', ')}`).join('; ')}`);
  }
  return new Map([...claims.entries()].map(([file, owners]) => [file, owners[0]]));
}

export async function migrateIntegrityForPhase(stageRoot, descriptor, payloadPaths, deletePaths) {
  const models = await loadManifestModels(stageRoot, descriptor);
  const ownership = buildOwnership(models);
  const touched = new Set();
  const newOwnership = descriptor.newOwnership ?? {};

  for (const relative of payloadPaths) {
    const existingOwner = ownership.get(relative);
    if (existingOwner) {
      const requestedOwner = newOwnership[relative];
      if (requestedOwner && requestedOwner !== existingOwner) throw new Error(`Existing file ${relative} is already owned by ${existingOwner}; use a dedicated ownership-migration phase to move it.`);
      touched.add(existingOwner);
      continue;
    }
    const owner = newOwnership[relative];
    if (!owner) throw new Error(`New payload file has no declared manifest owner: ${relative}`);
    const model = models.get(owner);
    if (!model) throw new Error(`New payload owner manifest is unavailable: ${owner}`);
    model.files[relative] = '0'.repeat(64);
    ownership.set(relative, owner);
    touched.add(owner);
  }

  for (const relative of deletePaths) {
    const owner = ownership.get(relative);
    if (!owner) continue;
    const model = models.get(owner);
    delete model.files[relative];
    ownership.delete(relative);
    touched.add(owner);
  }

  for (const manifest of touched) {
    const model = models.get(manifest);
    const files = {};
    for (const relative of Object.keys(model.files).sort()) {
      const target = path.join(stageRoot, ...relative.split('/'));
      if (!fs.existsSync(target) || !(await fsp.stat(target)).isFile()) throw new Error(`${manifest} ownership target missing after phase application: ${relative}`);
      files[relative] = canonicalSha256File(target);
    }
    model.files = files;
    await writeJson(path.join(stageRoot, ...manifest.split('/')), model);
  }
  return [...touched].sort();
}

async function walkFiles(root, relativeDir = '') {
  const out = [];
  const directory = relativeDir ? path.join(root, ...relativeDir.split('/')) : root;
  if (!fs.existsSync(directory)) return out;
  for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
    const relative = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
    const normalized = normalizeRelative(relative);
    if (isGenerated(normalized)) continue;
    if (entry.isDirectory()) out.push(...await walkFiles(root, normalized));
    else if (entry.isFile()) out.push(normalized);
  }
  return out.sort();
}

export async function snapshotCandidate(root) {
  const map = new Map();
  for (const relative of await walkFiles(root)) map.set(relative, rawSha256File(path.join(root, ...relative.split('/'))));
  return map;
}

export async function assertCandidateUnchanged(root, before) {
  const after = await snapshotCandidate(root);
  const beforeKeys = [...before.keys()].sort();
  const afterKeys = [...after.keys()].sort();
  if (JSON.stringify(beforeKeys) !== JSON.stringify(afterKeys)) {
    const added = afterKeys.filter(key => !before.has(key));
    const removed = beforeKeys.filter(key => !after.has(key));
    throw new Error(`Build changed candidate source boundary. Added: ${added.join(', ') || '(none)'}; removed: ${removed.join(', ') || '(none)'}.`);
  }
  const changed = beforeKeys.filter(key => before.get(key) !== after.get(key));
  if (changed.length) throw new Error(`Build mutated candidate source files: ${changed.join(', ')}.`);
}

export async function removeGeneratedState(root) {
  for (const rawRelative of GENERATED_PATHS) {
    const relative = assertSafeRelative(rawRelative);
    await fsp.rm(path.join(root, ...relative.split('/')), { recursive: true, force: true });
  }
}

export function runDefaultGates(stageRoot, commandRunner = run) {
  if (typeof commandRunner !== 'function') throw new Error('commandRunner must be a function.');
  console.log('[gate 1/4] Install frontend dependencies from lockfile');
  commandRunner('npm', ['ci', '--no-audit', '--no-fund'], { cwd: stageRoot });
  console.log('[gate 2/4] Deterministic repository verification');
  commandRunner('npm', ['run', 'verify'], { cwd: stageRoot });
  console.log('[gate 3/4] Native Rust validation - cargo check --locked');
  commandRunner('cargo', ['check', '--locked', '--manifest-path', 'src-tauri/Cargo.toml'], { cwd: stageRoot });
  console.log('[gate 4/4] Tauri release validation - build executable without bundle');
  commandRunner('npm', ['run', 'tauri', '--', 'build', '--no-bundle'], { cwd: stageRoot });
}

export async function computeCandidateDelta(repoRoot, stageRoot) {
  const baseFiles = git(repoRoot, ['ls-files', '-z'], { capture: true }).stdout.split('\0').filter(Boolean).map(assertSafeRelative);
  const baseSet = new Set(baseFiles);
  const stageFiles = await walkFiles(stageRoot);
  const stageSet = new Set(stageFiles);
  const changed = [];
  const deleted = [];

  for (const relative of stageFiles) {
    const stageFile = path.join(stageRoot, ...relative.split('/'));
    const repoFile = path.join(repoRoot, ...relative.split('/'));
    if (!baseSet.has(relative) || !fs.existsSync(repoFile) || rawSha256File(stageFile) !== rawSha256File(repoFile)) changed.push(relative);
  }
  for (const relative of baseFiles) {
    if (isGenerated(relative)) continue;
    if (!stageSet.has(relative)) deleted.push(relative);
  }
  return { changed: changed.sort(), deleted: deleted.sort() };
}

export function assertDeltaAllowed(delta, payloadPaths, touchedManifests, deletePaths) {
  const allowedChanged = new Set([...payloadPaths, ...touchedManifests].map(assertSafeRelative));
  const allowedDeleted = new Set(deletePaths.map(assertSafeRelative));
  const unexpectedChanged = delta.changed.filter(relative => !allowedChanged.has(relative));
  const unexpectedDeleted = delta.deleted.filter(relative => !allowedDeleted.has(relative));
  if (unexpectedChanged.length || unexpectedDeleted.length) {
    throw new Error(`Candidate delta escaped declared phase boundary. Unexpected changed: ${unexpectedChanged.join(', ') || '(none)'}; unexpected deleted: ${unexpectedDeleted.join(', ') || '(none)'}.`);
  }
}

export async function assertRawPromotionIdentity(stageRoot, repoRoot, promotePaths) {
  for (const rawRelative of promotePaths) {
    const relative = assertSafeRelative(rawRelative);
    const stageFile = path.join(stageRoot, ...relative.split('/'));
    const repoFile = path.join(repoRoot, ...relative.split('/'));
    if (!fs.existsSync(stageFile) || !fs.existsSync(repoFile)) throw new Error(`Promotion identity target missing: ${relative}`);
    const stageHash = rawSha256File(stageFile);
    const repoHash = rawSha256File(repoFile);
    if (stageHash !== repoHash) throw new Error(`Promotion byte mismatch for ${relative}: stage ${stageHash}, target ${repoHash}.`);
  }
}

export async function assertDeleted(repoRoot, deletePaths) {
  for (const rawRelative of deletePaths) {
    const relative = assertSafeRelative(rawRelative);
    if (fs.existsSync(path.join(repoRoot, ...relative.split('/')))) throw new Error(`Declared deletion still exists after promotion: ${relative}`);
  }
}

export async function promoteTransactional({ stageRoot, repoRoot, promotePaths, deletePaths, phase, verify }) {
  const safePromote = [...new Set(promotePaths.map(assertSafeRelative))].sort();
  const safeDelete = [...new Set(deletePaths.map(assertSafeRelative))].sort();
  const overlap = safePromote.filter(relative => safeDelete.includes(relative));
  if (overlap.length) throw new Error(`Promote/delete overlap: ${overlap.join(', ')}.`);
  for (const relative of safeDelete) {
    const target = path.join(repoRoot, ...relative.split('/'));
    if (fs.existsSync(target) && !(await fsp.stat(target)).isFile()) throw new Error(`Transactional deletion refuses directory: ${relative}`);
  }

  const backupRoot = path.join(path.dirname(repoRoot), `.rbrwx-installer-backup-${phase}-${process.pid}`);
  await fsp.rm(backupRoot, { recursive: true, force: true });
  await fsp.mkdir(backupRoot, { recursive: true });
  const existed = new Map();
  const affected = [...new Set([...safePromote, ...safeDelete])];

  try {
    for (const relative of affected) {
      const target = path.join(repoRoot, ...relative.split('/'));
      const present = fs.existsSync(target) && (await fsp.stat(target)).isFile();
      existed.set(relative, present);
      if (present) {
        const backup = path.join(backupRoot, ...relative.split('/'));
        await fsp.mkdir(path.dirname(backup), { recursive: true });
        await fsp.copyFile(target, backup);
      }
    }

    for (const relative of safePromote) {
      const source = path.join(stageRoot, ...relative.split('/'));
      if (!fs.existsSync(source) || !(await fsp.stat(source)).isFile()) throw new Error(`Promotion source missing: ${relative}`);
      const target = path.join(repoRoot, ...relative.split('/'));
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.copyFile(source, target);
    }
    for (const relative of safeDelete) await fsp.rm(path.join(repoRoot, ...relative.split('/')), { force: true });

    await assertRawPromotionIdentity(stageRoot, repoRoot, safePromote);
    await assertDeleted(repoRoot, safeDelete);
    if (verify) await verify();
    await fsp.rm(backupRoot, { recursive: true, force: true });
  } catch (error) {
    for (const relative of affected.reverse()) {
      const target = path.join(repoRoot, ...relative.split('/'));
      if (existed.get(relative)) {
        const backup = path.join(backupRoot, ...relative.split('/'));
        await fsp.mkdir(path.dirname(target), { recursive: true });
        await fsp.copyFile(backup, target);
      } else {
        await fsp.rm(target, { force: true });
      }
    }
    await fsp.rm(backupRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function runPhaseInstaller({ repoRoot: repoArg, packageRoot, descriptor, gateRunner = runDefaultGates }) {
  if (typeof gateRunner !== 'function') throw new Error('gateRunner must be a function.');
  const validated = await validatePhaseDescriptor(packageRoot, descriptor);
  const repoRoot = await assertExactCleanRepo(repoArg, descriptor.acceptedBase);
  const stageRoot = path.join(path.dirname(repoRoot), `.rbrwx-installer-stage-${descriptor.phase}-${process.pid}`);

  console.log(`RBRWX NEXT phase installer: ${descriptor.phase}`);
  console.log(`Accepted base: ${descriptor.acceptedBase}`);
  console.log('[0/7] Exact Git / clean-tree / canonical-integrity preflight');
  console.log('[1/7] Copy exact clean working-tree files into non-Git staging');

  try {
    await materializeWorkingTree(repoRoot, stageRoot);
    console.log('[2/7] Apply signed payload / declared deletes / ownership migration');
    const payloadPaths = await applyDeclaredPayload(packageRoot, stageRoot, descriptor);
    await applyDeclaredDeletes(stageRoot, validated.deletePaths);
    const touchedManifests = await migrateIntegrityForPhase(stageRoot, descriptor, payloadPaths, validated.deletePaths);
    run('node', ['scripts/repo/verify-integrity.mjs'], { cwd: stageRoot });

    console.log('[3/7] Snapshot candidate source boundary');
    const beforeBuild = await snapshotCandidate(stageRoot);

    console.log('[4/7] Deterministic JavaScript/TypeScript and native build gates');
    await gateRunner(stageRoot);
    await removeGeneratedState(stageRoot);
    await assertCandidateUnchanged(stageRoot, beforeBuild);
    run('node', ['scripts/repo/verify-integrity.mjs'], { cwd: stageRoot });

    console.log('[5/7] Compute and constrain exact candidate delta');
    const delta = await computeCandidateDelta(repoRoot, stageRoot);
    assertDeltaAllowed(delta, payloadPaths, touchedManifests, validated.deletePaths);

    console.log('[6/7] Transactional promotion + exact byte verification + rollback-protected repository verification');
    await promoteTransactional({
      stageRoot,
      repoRoot,
      promotePaths: delta.changed,
      deletePaths: delta.deleted,
      phase: descriptor.phase,
      verify: async () => {
        run('node', ['scripts/repo/verify-integrity.mjs'], { cwd: repoRoot });
        const frameworkTest = path.join(repoRoot, 'scripts', 'install', 'framework.test.mjs');
        if (fs.existsSync(frameworkTest)) run('node', ['--test', 'scripts/install/framework.test.mjs'], { cwd: repoRoot });
        const head = git(repoRoot, ['rev-parse', 'HEAD'], { capture: true }).stdout.trim();
        if (head !== descriptor.acceptedBase) throw new Error(`Git HEAD changed during installation: ${head}`);
      },
    });

    console.log('[7/7] INSTALL / BUILD VALIDATION: PASS');
    console.log(`Changed files: ${delta.changed.length}; deleted files: ${delta.deleted.length}. Commit this checkpoint before starting another phase.`);
    return { repoRoot, changed: delta.changed, deleted: delta.deleted, touchedManifests };
  } finally {
    await fsp.rm(stageRoot, { recursive: true, force: true });
  }
}
