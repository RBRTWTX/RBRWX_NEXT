import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');

const required = [
  'broadcast-graphics-contract.json',
  'src/defaults.ts',
  'src/state.ts',
  'src/resolve.ts',
  'src/renderModel.ts',
  'src/react/GraphicsMenu.tsx',
  'src/react/GraphicsStage.tsx',
  'styles/broadcast-graphics.css',
  'styles/graphics-menu.css',
  'tests/core.test.mjs',
  'tests/render.test.mjs',
];

for (const relative of required) await read(relative);

const contract = JSON.parse(await read('broadcast-graphics-contract.json'));
assert.equal(contract.package, '@rbrwx/broadcast-graphics');
assert.deepEqual(contract.scope, ['title-bar', 'lower-third', 'ticker']);
assert.deepEqual(contract.startup, {
  titleBarVisible: false,
  lowerThirdVisible: false,
  tickerVisible: false,
});
assert.equal(contract.titleBar.sceneAssociatedByDefault, true);
assert.equal(contract.titleBar.blankModeSupportsText, true);
assert.equal(contract.rendering.visibleDragMarkers, false);
assert.equal(contract.rendering.visibleResizeMarkers, false);
assert.equal(contract.rendering.visibleRemoveMarkers, false);
assert.equal(contract.isolation.hostImports, false);
assert.equal(contract.isolation.hostEntryPointChanges, false);
assert.equal(contract.isolation.rootPackageChanges, false);
assert.equal(contract.isolation.acceptedBuildDependency, false);

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(absolute));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(absolute);
  }
  return files;
}

for (const file of await sourceFiles(path.join(root, 'src'))) {
  const source = await readFile(file, 'utf8');
  assert.doesNotMatch(source, /from\s+['"](?:\.\.\/){2,}/, `${path.relative(root, file)} imports outside the package`);
  assert.doesNotMatch(source, /(?:broadcast-host|BroadcastProvider|BroadcastMap|maplibre|tauri)/i, `${path.relative(root, file)} imports a host module`);
}

const stage = await read('src/react/GraphicsStage.tsx');
assert.doesNotMatch(stage, /contentEditable|onPointerDown|onDrag|onDrop|<button/i);
assert.doesNotMatch(stage, /graphic-(?:remove|resize)|showResize|showRemove|resizeHandle|dragHandle|is-selected/i);

const graphicsCss = await read('styles/broadcast-graphics.css');
assert.doesNotMatch(graphicsCss, /cursor\s*:\s*(?:move|grab|nwse-resize)|graphic-(?:remove|resize)|is-selected/i);

const defaults = await read('src/defaults.ts');
assert.match(defaults, /titleBar:\s*false/);
assert.match(defaults, /lowerThird:\s*false/);
assert.match(defaults, /ticker:\s*false/);

console.log('RBRWX standalone Broadcast Graphics structural contract: PASS');
