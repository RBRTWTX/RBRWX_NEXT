import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importSpecifiers } from './source-imports.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

function fail(message) { throw new Error(`Broadcast package contract: ${message}`); }
async function read(relative) { return readFile(path.join(root, relative), 'utf8'); }
async function readJson(relative) {
  try { return JSON.parse(await read(relative)); }
  catch (error) { fail(`${relative}: invalid JSON (${error instanceof Error ? error.message : String(error)}).`); }
}
async function listFiles(relativeDir, extensions) {
  const dir = path.join(root, relativeDir); const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const relative = path.posix.join(relativeDir.replaceAll('\\', '/'), entry.name);
    if (entry.isDirectory()) out.push(...await listFiles(relative, extensions));
    else if (!extensions || extensions.some((ext) => entry.name.endsWith(ext))) out.push(relative);
  }
  return out.sort();
}
function normalizeResolvedImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  return path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier));
}
function isWithin(resolved, rootDir) { return resolved === rootDir || resolved.startsWith(`${rootDir}/`); }
function assertScopedCss(source, relative) {
  const noComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  if (/\@import\b|url\s*\(\s*['\"]?https?:/i.test(noComments)) fail(`${relative} imports an external stylesheet/asset.`);
  for (const match of noComments.matchAll(/([^{}]+)\{/g)) {
    const selectorGroup = match[1].trim();
    if (!selectorGroup || selectorGroup.startsWith('@')) continue;
    for (const selector of selectorGroup.split(',').map((v) => v.trim()).filter(Boolean)) {
      if (!selector.includes('.rbrwx-broadcast-workspace')) fail(`${relative} has unscoped selector: ${selector}`);
    }
  }
}

const contract = await readJson('src/broadcast/broadcastContract.json');
if (contract.schemaVersion !== 1 || contract.module !== 'broadcast-base') fail('broadcastContract.json identity drifted.');
if (JSON.stringify(contract.surfaces) !== JSON.stringify(['library', 'rundown', 'preview', 'program'])) fail('Broadcast surfaces drifted.');
if (JSON.stringify(contract.transportControls) !== JSON.stringify(['previous', 'play', 'pause', 'next', 'take', 'loop'])) fail('Broadcast transport contract drifted.');
const transitions = contract.transitions?.map((entry) => [entry.id, entry.defaultDurationMs]);
if (JSON.stringify(transitions) !== JSON.stringify([['cut', 0], ['dissolve', 500], ['fade', 750]])) fail('Broadcast transition contract drifted.');

const broadcastFiles = await listFiles('src/broadcast', ['.ts', '.tsx']);
const requiredBroadcastCodeFiles = [
  'src/broadcast/BroadcastProvider.tsx', 'src/broadcast/RundownDock.tsx', 'src/broadcast/SceneLibrary.tsx',
  'src/broadcast/broadcastState.ts', 'src/broadcast/broadcastTypes.ts', 'src/broadcast/index.ts',
];
for (const required of requiredBroadcastCodeFiles) if (!broadcastFiles.includes(required)) fail(`Broadcast module is missing required source ${required}.`);
for (const relative of broadcastFiles) {
  const source = await read(relative);
  if (/https?:\/\//i.test(source)) fail(`${relative} contains a provider/network URL; Broadcast Base must remain provider-independent.`);
  const { specs, hasDynamicNonliteral } = importSpecifiers(source, relative);
  if (hasDynamicNonliteral) fail(`${relative} uses a non-literal dynamic import/require; isolation cannot be proven.`);
  for (const spec of specs) {
    if (spec.startsWith('.')) {
      const resolved = normalizeResolvedImport(relative, spec);
      if (!resolved || !isWithin(resolved, 'src/broadcast')) fail(`${relative} imports outside src/broadcast via ${spec}.`);
    } else if (!contract.hostBoundary.allowedExternalImports.includes(spec) && !spec.startsWith('react/')) fail(`${relative} imports forbidden external module ${spec}.`);
  }
}

const mapFiles = await listFiles('src/map', ['.ts', '.tsx']);
for (const relative of mapFiles) {
  const source = await read(relative); const { specs, hasDynamicNonliteral } = importSpecifiers(source, relative);
  if (hasDynamicNonliteral) continue;
  for (const spec of specs) {
    const resolved = normalizeResolvedImport(relative, spec);
    if (resolved && (isWithin(resolved, 'src/broadcast') || isWithin(resolved, 'src/broadcast-host') || isWithin(resolved, 'src/forecast-graphics') || isWithin(resolved, 'src/qpf') || isWithin(resolved, 'src/synoptic'))) fail(`${relative} imports workstation/graphic code via ${spec}; map must remain independent.`);
  }
}

const currentWeatherFiles = await listFiles('src/current-weather', ['.ts', '.tsx']);
for (const relative of currentWeatherFiles) {
  const source = await read(relative); const { specs, hasDynamicNonliteral } = importSpecifiers(source, relative);
  if (hasDynamicNonliteral) continue;
  for (const spec of specs) {
    const resolved = normalizeResolvedImport(relative, spec);
    if (resolved && (isWithin(resolved, 'src/forecast-graphics') || isWithin(resolved, 'src/qpf') || isWithin(resolved, 'src/synoptic'))) fail(`${relative} imports workstation extension code via ${spec}; current weather must remain independent.`);
  }
}

const qpfFiles = await listFiles('src/qpf', ['.ts', '.tsx']);
for (const relative of qpfFiles) {
  const source = await read(relative); const { specs, hasDynamicNonliteral } = importSpecifiers(source, relative);
  if (hasDynamicNonliteral) fail(`${relative} uses a non-literal dynamic import/require; QPF isolation cannot be proven.`);
  for (const spec of specs) {
    if (!spec.startsWith('.')) {
      if (!['react', 'maplibre-gl', 'geojson'].includes(spec) && !spec.startsWith('react/')) fail(`${relative} imports unexpected external module ${spec}.`);
      continue;
    }
    const resolved = normalizeResolvedImport(relative, spec);
    if (resolved && !isWithin(resolved, 'src/qpf')) fail(`${relative} imports outside src/qpf via ${spec}.`);
  }
}

// CP3A providers stay in their module; the host only consumes its public runtime/UI.
const synopticFiles = await listFiles('src/synoptic', ['.ts', '.tsx']);
if (synopticFiles.length < 6) fail('CP3A module is incomplete.');
for (const relative of synopticFiles) {
  const { specs, hasDynamicNonliteral } = importSpecifiers(await read(relative), relative);
  if (hasDynamicNonliteral) fail(`${relative} uses a non-literal dynamic import/require.`);
  for (const spec of specs) {
    if (!spec.startsWith('.')) {
      if (!['react','maplibre-gl','geojson','@azohra/meteo.grib','@azohra/meteo.j2k','fast-png','h5wasm'].includes(spec) && !spec.startsWith('react/')) fail(`${relative} imports unexpected module ${spec}.`);
      continue;
    }
    const resolved = normalizeResolvedImport(relative, spec);
    if (resolved && !isWithin(resolved,'src/synoptic') && resolved !== 'src/broadcast/index.ts' && !isWithin(resolved,'src/broadcast') && !resolved.startsWith('src/current-weather/public-imagery')) fail(`${relative} imports outside its module boundary via ${spec}.`);
  }
}

const originalApp = await read('src/app/App.tsx');
{
  const { specs } = importSpecifiers(originalApp, 'src/app/App.tsx');
  for (const spec of specs) {
    const resolved = normalizeResolvedImport('src/app/App.tsx', spec);
    if (resolved && (isWithin(resolved, 'src/broadcast') || isWithin(resolved, 'src/broadcast-host') || isWithin(resolved, 'src/forecast-graphics') || isWithin(resolved, 'src/qpf') || isWithin(resolved, 'src/synoptic'))) fail(`src/app/App.tsx imports standalone workstation code via ${spec}; the original working App must remain independent.`);
  }
}

const hostFiles = await listFiles('src/broadcast-host', ['.ts', '.tsx']);
if (hostFiles.length < 2) fail('RBRWX Broadcast host adapter is incomplete.');
for (const relative of hostFiles) {
  const source = await read(relative);
  if (/https?:\/\//i.test(source)) fail(`${relative} contains a provider URL; the host adapter must consume module APIs, not own providers.`);
  const { specs, hasDynamicNonliteral } = importSpecifiers(source, relative);
  if (hasDynamicNonliteral) fail(`${relative} uses a non-literal dynamic import/require.`);
  for (const spec of specs) {
    if (!spec.startsWith('.')) {
      if (!['react', '@tauri-apps/api/core', 'maplibre-gl'].includes(spec) && !spec.startsWith('react/')) fail(`${relative} imports unexpected external module ${spec}.`);
      continue;
    }
    const resolved = normalizeResolvedImport(relative, spec);
    if (!resolved) continue;
    const allowed = isWithin(resolved, 'src/broadcast') || isWithin(resolved, 'src/broadcast-host') || isWithin(resolved, 'src/map') || isWithin(resolved, 'src/broadcast-graphics') || isWithin(resolved, 'src/current-weather') || isWithin(resolved, 'src/forecast-graphics') || isWithin(resolved, 'src/qpf') || isWithin(resolved, 'src/synoptic');
    if (!allowed) fail(`${relative} imports outside the allowed host boundary via ${spec}.`);
  }
}

const mainSource = await read('src/main.tsx');
const mainImports = importSpecifiers(mainSource, 'src/main.tsx').specs;
if (!mainImports.includes('./broadcast-host/RbrwxBroadcastWorkspace')) fail('src/main.tsx does not mount the standalone Broadcast workspace.');
if (mainImports.includes('./app/App')) fail('src/main.tsx still mounts the original App directly; standalone Broadcast host switch is incomplete.');
if (!mainSource.includes('<RbrwxBroadcastWorkspace />')) fail('src/main.tsx does not render RbrwxBroadcastWorkspace.');

const host = await read('src/broadcast-host/RbrwxBroadcastWorkspace.tsx');
for (const token of ["contentKey === 'map.broadcast'", "contentKey === 'map.satellite'", '<BroadcastProvider', '<SceneLibrary />', '<RundownDock />', '<BroadcastMap', "useState<BroadcastBasemapMode>('broadcast')"]) {
  if (!host.includes(token)) fail(`RBRWX host adapter is missing required behavior: ${token}`);
}
if (!host.includes('<ForecastGraphicsHost>') || !host.includes('<ForecastGraphicEditorStage')) fail('RBRWX host adapter is missing the non-map graphic host/stage.');
if (!host.includes('<QpfHost>') || !host.includes('<QpfMapConnection>') || !host.includes('qpf: qpf.snapshot')) fail('RBRWX host adapter is missing the QPF map host/capture state.');

assertScopedCss(await read('src/broadcast/broadcast.css'), 'src/broadcast/broadcast.css');
assertScopedCss(await read('src/broadcast-host/broadcastHost.css'), 'src/broadcast-host/broadcastHost.css');
assertScopedCss(await read('src/forecast-graphics/forecastGraphics.css'), 'src/forecast-graphics/forecastGraphics.css');
assertScopedCss(await read('src/qpf/qpf.css'), 'src/qpf/qpf.css');

const manifest = await readJson('scripts/broadcast/broadcast-package-file-manifest.json');
if (manifest.schema !== 1 || manifest.release !== 'pre-0.3.0-broadcast-base-standalone') fail('Broadcast package manifest identity drifted.');
for (const relative of Object.keys(manifest.files)) {
  if (relative === 'src/main.tsx' || relative === 'src/app/App.tsx' || relative.startsWith('src/map/') || relative === 'src/styles.css' || relative.startsWith('src-tauri/')) fail(`Broadcast package manifest improperly claims ownership of host/foundation file ${relative}.`);
}

const workflow = await read('.github/workflows/broadcast-base-ci.yml');
for (const token of ['node scripts/broadcast/verify-broadcast.mjs', 'npm run verify', 'npm run tauri -- build --no-bundle']) if (!workflow.includes(token)) fail(`Broadcast CI workflow is missing ${token}.`);
const originalAppStat = await stat(path.join(root, 'src/app/App.tsx'));
if (!originalAppStat.isFile()) fail('Original src/app/App.tsx fallback is missing.');

console.log('RBRWX standalone Broadcast package contract: PASS');
console.log(`  Broadcast core TS/TSX files: ${broadcastFiles.length}`);
console.log(`  Host adapter TS/TSX files: ${hostFiles.length}`);
console.log(`  Map files checked for reverse dependency: ${mapFiles.length}`);
console.log(`  Current-weather files checked for reverse dependency: ${currentWeatherFiles.length}`);
console.log(`  QPF module TS/TSX files: ${qpfFiles.length}`);
