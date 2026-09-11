// Build checks use a pinned, private JS compiler API; the host compiler stays unchanged.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const vendorUrl = new URL('./vendor/typescript/typescript.cjs', import.meta.url);
const expected = '3ae902c92cc44dace175c0e69e13a4b0899f6983c6121d76b9ab8dd5795e7675';
const actual = createHash('sha256').update(readFileSync(vendorUrl)).digest('hex');
if (actual !== expected) throw new Error('Broadcast compiler API integrity failure. Re-extract the complete installer ZIP.');
const ts = createRequire(import.meta.url)(fileURLToPath(vendorUrl));
if (ts.version !== '5.9.3') throw new Error('Broadcast compiler API version mismatch.');
for (const key of ['createSourceFile', 'transpileModule', 'forEachChild', 'isStringLiteralLike',
  'isImportDeclaration', 'isExportDeclaration', 'isCallExpression', 'isIdentifier',
  'flattenDiagnosticMessageText']) {
  if (typeof ts[key] !== 'function') throw new Error('Broadcast compiler API missing: ' + key);
}
for (const [group, key] of [['ScriptKind', 'TSX'], ['ScriptKind', 'TS'],
  ['ScriptTarget', 'Latest'], ['ScriptTarget', 'ES2022'], ['ModuleKind', 'ES2022'],
  ['SyntaxKind', 'ImportKeyword'], ['DiagnosticCategory', 'Error']]) {
  if (typeof ts[group]?.[key] !== 'number') throw new Error('Broadcast compiler API missing: ' + group + '.' + key);
}
export default ts;
