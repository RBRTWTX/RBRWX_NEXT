import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const BINARY_EXTENSIONS = new Set([
  '.png', '.ico', '.jpg', '.jpeg', '.gif', '.webp', '.zip', '.wasm',
  '.woff', '.woff2', '.ttf', '.otf', '.pdf', '.gz', '.br',
]);

function asPath(value) {
  return value instanceof URL ? fileURLToPath(value) : String(value);
}

export function rawSha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function rawSha256File(file) {
  return rawSha256Bytes(fs.readFileSync(asPath(file)));
}

export function isBinaryIntegrityPath(file, bytes = null) {
  const filename = asPath(file);
  if (BINARY_EXTENSIONS.has(path.extname(filename).toLowerCase())) return true;
  const data = bytes ?? fs.readFileSync(filename);
  if (data.includes(0)) return true;
  try {
    const decoded = data.toString('utf8');
    return !Buffer.from(decoded, 'utf8').equals(data);
  } catch {
    return true;
  }
}

export function canonicalIntegrityBytes(bytes, fileHint = '') {
  if (isBinaryIntegrityPath(fileHint || 'file.bin', bytes)) return bytes;
  const text = bytes.toString('utf8').replace(/\r\n?/g, '\n');
  return Buffer.from(text, 'utf8');
}

export function canonicalSha256Bytes(bytes, fileHint = '') {
  return rawSha256Bytes(canonicalIntegrityBytes(bytes, fileHint));
}

export function canonicalSha256File(file) {
  const filename = asPath(file);
  const bytes = fs.readFileSync(filename);
  return canonicalSha256Bytes(bytes, filename);
}
