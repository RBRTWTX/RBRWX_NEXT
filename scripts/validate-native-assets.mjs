import { readFile } from 'node:fs/promises';

const nativeRoot = new URL('../src-tauri/', import.meta.url);
const config = JSON.parse(await readFile(new URL('tauri.conf.json', nativeRoot), 'utf8'));
const icons = config.bundle?.icon ?? [];

function fail(message) { throw new Error(`Native asset contract: ${message}`); }

function checkPng(bytes, label) {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ||
      bytes.toString('ascii', 12, 16) !== 'IHDR') fail(`${label}: invalid PNG header.`);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!width || !height || width !== height || bytes[24] !== 8 || bytes[25] !== 6) {
    fail(`${label}: expected square 8-bit RGBA PNG.`);
  }
  return { width, height };
}

for (const name of ['icons/icon.ico', 'icons/icon.png']) {
  if (!icons.includes(name)) fail(`${name} must be explicitly listed in bundle.icon.`);
  let bytes;
  try { bytes = await readFile(new URL(name, nativeRoot)); }
  catch (error) { fail(`${name}: missing or unreadable (${error.code ?? error.message}).`); }
  if (name.endsWith('.png')) {
    checkPng(bytes, name);
  } else {
    if (bytes.length < 6 || bytes.readUInt16LE(0) !== 0 || bytes.readUInt16LE(2) !== 1) fail(`${name}: invalid ICO header.`);
    const count = bytes.readUInt16LE(4);
    if (!count || bytes.length < 6 + count * 16) fail(`${name}: incomplete ICO directory.`);
    for (let i = 0; i < count; i++) {
      const entry = 6 + i * 16;
      const size = bytes.readUInt32LE(entry + 8);
      const offset = bytes.readUInt32LE(entry + 12);
      if (!size || offset < 6 + count * 16 || offset + size > bytes.length) fail(`${name}: invalid frame ${i} bounds.`);
      const dimensions = checkPng(bytes.subarray(offset, offset + size), `${name} frame ${i}`);
      if (dimensions.width !== (bytes[entry] || 256) || dimensions.height !== (bytes[entry + 1] || 256)) {
        fail(`${name}: frame ${i} dimensions disagree with directory.`);
      }
    }
    console.log(`Native ICO structure: PASS (${count} PNG frames)`);
  }
}
console.log('RBRWX native icon asset contract: PASS');
