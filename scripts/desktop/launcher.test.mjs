import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sourceFingerprint, currentExecutable, publishExecutable } from './launcher.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rbrwx launch space & quote\'-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const dir of ['src', 'src-tauri', 'scripts']) fs.mkdirSync(path.join(root, dir));
  for (const file of ['src/main.tsx', 'src-tauri/main.rs', 'scripts/check.mjs',
    'package.json', 'package-lock.json', 'index.html', 'vite.config.ts',
    'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'rust-toolchain.toml']) {
    fs.writeFileSync(path.join(root, file), 'original\n');
  }
  return root;
}

test('source edits/new files invalidate launch; output, operator assets and line endings do not', t => {
  const root = fixture(t);
  const first = sourceFingerprint(root);
  for (const dir of ['src-tauri/target', 'src-tauri/gen', 'asset-library/png']) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.writeFileSync(path.join(root, dir, 'local'), 'do not touch');
  }
  fs.writeFileSync(path.join(root, 'src/main.tsx'), 'original\r\n');
  assert.equal(sourceFingerprint(root), first);
  fs.writeFileSync(path.join(root, 'src/new.ts'), 'new source');
  assert.notEqual(sourceFingerprint(root), first);
  fs.unlinkSync(path.join(root, 'src/new.ts'));
  fs.writeFileSync(path.join(root, 'package-lock.json'), 'changed lock');
  assert.notEqual(sourceFingerprint(root), first);
});

test('only a matching, intact published executable can launch', t => {
  const root = fixture(t);
  const fingerprint = sourceFingerprint(root);
  const built = path.join(root, 'fixture.exe');
  fs.writeFileSync(built, 'binary fixture');
  assert.equal(currentExecutable(root, fingerprint), null);
  const app = publishExecutable(root, fingerprint, built);
  assert.equal(currentExecutable(root, fingerprint), app);
  assert.equal(currentExecutable(root, 'different source'), null);
  fs.writeFileSync(app, 'damaged binary');
  assert.equal(currentExecutable(root, fingerprint), null);
});

test('failed publication and concurrent source changes preserve the previous release', t => {
  const root = fixture(t);
  const fingerprint = sourceFingerprint(root);
  const built = path.join(root, 'fixture.exe');
  fs.writeFileSync(built, 'binary fixture');
  const previous = publishExecutable(root, fingerprint, built);
  assert.throws(() => publishExecutable(root, fingerprint, path.join(root, 'missing.exe')));
  assert.equal(currentExecutable(root, fingerprint), previous);
  fs.writeFileSync(path.join(root, 'src/main.tsx'), 'edited while building');
  assert.throws(() => publishExecutable(root, fingerprint, built), /Source changed/);
  assert.equal(fs.readFileSync(previous, 'utf8'), 'binary fixture');
});

test('malformed or redirected launcher state cannot select an arbitrary executable', t => {
  const root = fixture(t);
  const fingerprint = sourceFingerprint(root);
  fs.mkdirSync(path.join(root, '.rbrwx-launcher'));
  const state = path.join(root, '.rbrwx-launcher/current.json');
  fs.writeFileSync(state, '{broken');
  assert.equal(currentExecutable(root, fingerprint), null);
  fs.writeFileSync(state, JSON.stringify({ schema: 1, fingerprint, file: '../another.exe' }));
  assert.equal(currentExecutable(root, fingerprint), null);
});
