import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalSha256File } from './integrity.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const manifests = [
  'scripts/foundation-file-manifest.json',
  'scripts/broadcast/broadcast-package-file-manifest.json',
  'scripts/current-weather/payload-manifest.json',
  'scripts/forecast-graphics/payload-manifest.json',
  'scripts/qpf/payload-manifest.json',
];

function fail(message) { throw new Error(`RBRWX repository integrity: ${message}`); }
function safeRelative(value) {
  const relative = String(value).replaceAll('\\', '/').replace(/^\.\//, '');
  if (!relative || relative.startsWith('/') || /^[A-Za-z]:\//.test(relative)) fail(`unsafe manifest path ${value}`);
  if (relative.split('/').some(part => !part || part === '..')) fail(`unsafe manifest path ${value}`);
  return relative;
}

const claims = new Map();
let entries = 0;
for (const manifestRelative of manifests) {
  const manifestPath = path.join(root, ...manifestRelative.split('/'));
  if (!fs.existsSync(manifestPath)) fail(`missing manifest ${manifestRelative}`);
  const model = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (model.schema !== 1 || !model.files || typeof model.files !== 'object' || Array.isArray(model.files)) fail(`invalid manifest ${manifestRelative}`);
  for (const [rawRelative, expected] of Object.entries(model.files)) {
    const relative = safeRelative(rawRelative);
    if (!/^[a-f0-9]{64}$/i.test(String(expected))) fail(`${manifestRelative} has invalid SHA-256 for ${relative}`);
    if (relative.endsWith('.tsbuildinfo') || relative.startsWith('src-tauri/gen/')) fail(`${manifestRelative} claims generated build state ${relative}`);
    if (!claims.has(relative)) claims.set(relative, []);
    claims.get(relative).push(manifestRelative);
    const target = path.join(root, ...relative.split('/'));
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) fail(`${manifestRelative} target missing: ${relative}`);
    const actual = canonicalSha256File(target);
    if (actual !== String(expected).toLowerCase()) fail(`${manifestRelative} integrity mismatch for ${relative}: expected ${expected}, got ${actual}`);
    entries += 1;
  }
}

const duplicates = [...claims.entries()].filter(([, owners]) => owners.length > 1);
if (duplicates.length) fail(`duplicate ownership: ${duplicates.map(([file, owners]) => `${file} => ${owners.join(', ')}`).join('; ')}`);
console.log(`RBRWX repository canonical integrity: PASS (${manifests.length} manifests, ${entries} single-owner entries).`);
