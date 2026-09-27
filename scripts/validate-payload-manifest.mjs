import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { canonicalSha256File } from './repo/integrity.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifestPath = path.join(root, 'scripts', 'foundation-file-manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

if (manifest.schema !== 1 || manifest.release !== '0.1.0-broadcast-map-foundation') {
  throw new Error('Foundation payload manifest header is invalid.');
}

for (const [relativePath, expected] of Object.entries(manifest.files)) {
  const fullPath = path.join(root, relativePath);
  const actual = canonicalSha256File(fullPath);
  if (actual !== expected) {
    throw new Error(`Foundation payload integrity failure: ${relativePath} expected ${expected} but got ${actual}.`);
  }
}

console.log(`RBRWX foundation payload integrity: PASS (${Object.keys(manifest.files).length} files, canonical text hashing)`);
