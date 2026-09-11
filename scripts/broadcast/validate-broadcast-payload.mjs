import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const manifestPath = path.join(root, 'scripts', 'broadcast', 'broadcast-package-file-manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (manifest.schema !== 1 || manifest.release !== 'pre-0.3.0-broadcast-base-standalone') throw new Error('Broadcast package manifest header is invalid.');
for (const [relative, expected] of Object.entries(manifest.files)) {
  const bytes = await readFile(path.join(root, relative));
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected) throw new Error(`Broadcast package integrity failure: ${relative} expected ${expected} but got ${actual}.`);
}
console.log(`RBRWX standalone Broadcast payload integrity: PASS (${Object.keys(manifest.files).length} files)`);
