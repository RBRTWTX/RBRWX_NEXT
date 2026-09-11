import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from './compiler-api.mjs';

const stateSource = await readFile(new URL('../../src/broadcast/broadcastState.ts', import.meta.url), 'utf8');
const transpiled = ts.transpileModule(stateSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  fileName: 'broadcastState.ts',
  reportDiagnostics: true,
});
const errors = (transpiled.diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error);
if (errors.length) throw new Error(errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join(' | '));
const state = await import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`);
const {
  MIN_SCENE_HOLD_MS,
  MAX_SCENE_HOLD_MS,
  normalizeSceneHoldMs,
  validateBroadcastSceneDefinitions,
  createInitialBroadcastState,
  adjacentProgramItemId,
  canPlayBroadcastState,
  broadcastReducer,
} = state;

const scene = (id, hold = 8000) => ({ id, title: `Title ${id}`, subtitle: 'Test', category: 'TEST', contentKey: `test.${id}`, defaultHoldMs: hold });
const holds = new Map([['a', 8000], ['b', 9000], ['c', 10000], ['d', 11000]]);
const initial = (...ids) => createInitialBroadcastState(ids, holds);
const ids = (value) => value.rundown.map((item) => item.id);

test('scene registration rejects ambiguity and unsafe hold values', () => {
  assert.doesNotThrow(() => validateBroadcastSceneDefinitions([scene('a'), scene('b')]));
  assert.throws(() => validateBroadcastSceneDefinitions([scene('a'), scene('a')]), /duplicated/);
  assert.throws(() => validateBroadcastSceneDefinitions([{ ...scene('a'), id: ' a' }]), /surrounding whitespace/);
  assert.throws(() => validateBroadcastSceneDefinitions([{ ...scene('a'), title: ' ' }]), /empty title/);
  assert.throws(() => validateBroadcastSceneDefinitions([{ ...scene('a'), category: ' ' }]), /empty category/);
  assert.throws(() => validateBroadcastSceneDefinitions([{ ...scene('a'), contentKey: ' test.a ' }]), /contentKey/);
  for (const hold of [NaN, Infinity, -Infinity, 1000.5, MIN_SCENE_HOLD_MS - 1, MAX_SCENE_HOLD_MS + 1]) {
    assert.throws(() => validateBroadcastSceneDefinitions([scene('a', hold)]), /invalid defaultHoldMs/);
  }
});

test('hold normalization is finite, integer, and bounded', () => {
  assert.equal(normalizeSceneHoldMs(NaN), 8000);
  assert.equal(normalizeSceneHoldMs(1), MIN_SCENE_HOLD_MS);
  assert.equal(normalizeSceneHoldMs(MAX_SCENE_HOLD_MS + 1), MAX_SCENE_HOLD_MS);
  assert.equal(normalizeSceneHoldMs(1000.6), 1001);
});

test('library selection cannot change Preview or Program', () => {
  const before = initial('a', 'b');
  const after = broadcastReducer(before, { type: 'select-library-scene', sceneId: 'b' });
  assert.equal(after.programItemId, before.programItemId);
  assert.equal(after.previewItemId, before.previewItemId);
  assert.equal(after.selectedLibrarySceneId, 'b');
});

test('duplicate presets create distinct rundown instances', () => {
  let value = initial('a');
  value = broadcastReducer(value, { type: 'add-scene', sceneId: 'a', holdMs: 7000 });
  assert.deepEqual(ids(value), ['rundown-1', 'rundown-2']);
  assert.deepEqual(value.rundown.map((item) => item.sceneId), ['a', 'a']);
  assert.equal(value.programItemId, 'rundown-1');
  assert.equal(value.previewItemId, 'rundown-2');
});

test('Program cannot be removed and Preview recovers safely', () => {
  const base = initial('a', 'b', 'c');
  assert.equal(broadcastReducer(base, { type: 'remove-item', itemId: 'rundown-1' }), base);
  let value = broadcastReducer(base, { type: 'select-preview', itemId: 'rundown-2' });
  value = broadcastReducer(value, { type: 'remove-item', itemId: 'rundown-2' });
  assert.deepEqual(ids(value), ['rundown-1', 'rundown-3']);
  assert.equal(value.previewItemId, 'rundown-3');
});

test('rundown reorder supports beginning, middle, and true end', () => {
  const base = initial('a', 'b', 'c', 'd');
  assert.deepEqual(ids(broadcastReducer(base, { type: 'move-item', itemId: 'rundown-1', beforeItemId: null })), ['rundown-2', 'rundown-3', 'rundown-4', 'rundown-1']);
  assert.deepEqual(ids(broadcastReducer(base, { type: 'move-item', itemId: 'rundown-4', beforeItemId: 'rundown-1' })), ['rundown-4', 'rundown-1', 'rundown-2', 'rundown-3']);
  assert.deepEqual(ids(broadcastReducer(base, { type: 'move-item', itemId: 'rundown-2', beforeItemId: 'rundown-4' })), ['rundown-1', 'rundown-3', 'rundown-2', 'rundown-4']);
});

test('Previous, Next, Loop, and canPlay honor rundown boundaries', () => {
  assert.equal(canPlayBroadcastState(initial()), false);
  assert.equal(canPlayBroadcastState(initial('a')), false);
  let value = initial('a', 'b', 'c');
  assert.equal(adjacentProgramItemId(value, -1), null);
  assert.equal(adjacentProgramItemId(value, 1), 'rundown-2');
  assert.equal(canPlayBroadcastState(value), true);
  value = broadcastReducer(value, { type: 'set-program', itemId: 'rundown-3' });
  assert.equal(adjacentProgramItemId(value, 1), null);
  assert.equal(canPlayBroadcastState(value), false);
  value = broadcastReducer(value, { type: 'set-loop', loop: true });
  assert.equal(adjacentProgramItemId(value, 1), 'rundown-1');
  assert.equal(canPlayBroadcastState(value), true);
});
