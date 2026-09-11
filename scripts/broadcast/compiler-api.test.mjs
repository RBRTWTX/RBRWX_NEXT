import assert from 'node:assert/strict';
import test from 'node:test';
import ts from './compiler-api.mjs';
import { importSpecifiers } from './source-imports.mjs';

test('private compiler supplies parser and transpiler independently of host TypeScript', () => {
  assert.equal(ts.version, '5.9.3');
  const result = ts.transpileModule('export const n: number = 3;', {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  });
  assert.match(result.outputText, /export const n = 3/);
});
test('TSX parser collects static imports, re-exports and literal dynamic dependencies', () => {
  const result = importSpecifiers(`
    import type { X } from './types';
    import React from 'react';
    export { y } from './other';
    const x = <div>hello</div>;
    const a = import('./lazy');
    const b = require('./legacy');
  `, 'component.tsx');
  assert.deepEqual(result.specs, ['./types', 'react', './other', './lazy', './legacy']);
  assert.equal(result.hasDynamicNonliteral, false);
});
test('computed dynamic imports remain rejected by isolation checks', () => {
  assert.equal(importSpecifiers('const a = import(name);', 'a.ts').hasDynamicNonliteral, true);
  assert.equal(importSpecifiers('const a = require(name);', 'a.ts').hasDynamicNonliteral, true);
});
test('comments and strings cannot masquerade as import declarations', () => {
  const result = importSpecifiers(`// import x from 'bad'
    const text = "import x from 'bad'";
  `, 'a.ts');
  assert.deepEqual(result.specs, []);
});
test('malformed source fails parsing instead of passing isolation checks', () => {
  assert.throws(() => importSpecifiers('import {', 'broken.ts'), /broken.ts/);
});
