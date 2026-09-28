import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { canonicalSha256File } from '../repo/integrity.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const inputs = ['src', 'src-tauri', 'scripts', 'package.json', 'package-lock.json',
  'index.html', 'vite.config.ts', 'tsconfig.json', 'tsconfig.app.json',
  'tsconfig.node.json', 'rust-toolchain.toml'];
const excluded = new Set(['src-tauri/target', 'src-tauri/gen']);

// Include new source files as well as tracked files; ignore only known build output.
export function sourceFingerprint(repo) {
  const hash = createHash('sha256');
  function visit(relative) {
    if (excluded.has(relative)) return;
    const file = path.join(repo, relative);
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw new Error(`Build input must not be a symbolic link: ${relative}`);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(file).sort()) visit(`${relative}/${name}`);
    } else if (stat.isFile()) {
      hash.update(relative + '\0' + canonicalSha256File(file) + '\0');
    }
  }
  inputs.forEach(visit);
  return hash.digest('hex');
}

function binaryHash(file) { return createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }

export function currentExecutable(repo, fingerprint) {
  try {
    const state = JSON.parse(fs.readFileSync(path.join(repo, '.rbrwx-launcher/current.json'), 'utf8'));
    if (state.schema !== 1 || state.fingerprint !== fingerprint ||
        !/^rbrwx-next-[a-f0-9-]+\.exe$/.test(state.file)) return null;
    const executable = path.join(repo, '.rbrwx-launcher', state.file);
    return binaryHash(executable) === state.sha256 ? executable : null;
  } catch { return null; }
}

// Publish only after every build gate succeeds. A failed rebuild preserves the prior file.
export function publishExecutable(repo, fingerprint, builtFile) {
  if (sourceFingerprint(repo) !== fingerprint) throw new Error('Source changed during the build. Please launch again.');
  const dir = path.join(repo, '.rbrwx-launcher');
  fs.mkdirSync(dir, { recursive: true });
  const file = `rbrwx-next-${randomUUID()}.exe`;
  const target = path.join(dir, file);
  fs.copyFileSync(builtFile, target, fs.constants.COPYFILE_EXCL);
  const state = { schema: 1, fingerprint, file, sha256: binaryHash(target) };
  const temporary = path.join(dir, `current-${randomUUID()}.tmp`);
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2) + '\n');
  fs.renameSync(temporary, path.join(dir, 'current.json'));
  return target;
}

function run(command, args) {
  const isNpm = command === 'npm';
  const result = spawnSync(isNpm ? process.env.ComSpec || 'cmd.exe' : command,
    isNpm ? ['/d', '/c', 'npm', ...args] : args,
    { cwd: root, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (exit ${result.status}). The app was not launched.`);
}

function acquireLock(dir) {
  const lock = path.join(dir, 'build.lock');
  try { fs.writeFileSync(lock, String(process.pid), { flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const pid = Number(fs.readFileSync(lock, 'utf8'));
    let alive = true;
    if (Number.isInteger(pid) && pid > 0) {
      try { process.kill(pid, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; }
    }
    if (alive) throw new Error('Another launcher/build is active. Wait for it to finish.');
    fs.unlinkSync(lock);
    fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
  }
  return () => fs.unlinkSync(lock);
}

async function main() {
  if (process.platform !== 'win32') throw new Error('This desktop launcher is for Windows.');
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22 || major > 24) throw new Error('Use the project-required Node 22–24.');
  const dir = path.join(root, '.rbrwx-launcher');
  fs.mkdirSync(dir, { recursive: true });
  const releaseLock = acquireLock(dir);
  let executable;
  try {
    const fingerprint = sourceFingerprint(root);
    executable = currentExecutable(root, fingerprint);
    if (!executable || process.argv.includes('--rebuild')) {
      console.log('Preparing RBRWX NEXT. First launch or updated source requires a native build.');
      console.log('Keep this window open; the application opens after all checks pass.');
      run('npm', ['ci', '--no-audit', '--no-fund']);
      run('npm', ['run', 'verify']);
      run('cargo', ['check', '--locked', '--manifest-path', 'src-tauri/Cargo.toml']);
      // Fixed output location, independent of a user-wide CARGO_TARGET_DIR.
      const oldTarget = process.env.CARGO_TARGET_DIR;
      process.env.CARGO_TARGET_DIR = path.join(root, 'src-tauri', 'target');
      try { run('npm', ['run', 'tauri', '--', 'build', '--no-bundle']); }
      finally {
        if (oldTarget === undefined) delete process.env.CARGO_TARGET_DIR;
        else process.env.CARGO_TARGET_DIR = oldTarget;
      }
      executable = publishExecutable(root, fingerprint, path.join(root, 'src-tauri/target/release/rbrwx-next.exe'));
    }
  } finally { releaseLock(); }
  await new Promise((resolve, reject) => {
    const app = spawn(executable, [], { cwd: root, detached: true, stdio: 'ignore', windowsHide: true });
    app.once('error', reject);
    app.once('spawn', () => { app.unref(); resolve(); });
  });
  console.log('RBRWX NEXT launched.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`\n${error.message}`); process.exitCode = 1; });
}
