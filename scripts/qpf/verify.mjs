import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = relative => fs.readFileSync(path.join(root, ...relative.split('/')), 'utf8');
const hash = relative => createHash('sha256').update(fs.readFileSync(path.join(root, ...relative.split('/')))).digest('hex');
const fail = message => { throw new Error(`RBRWX QPF contract: ${message}`); };

const manifest = JSON.parse(read('scripts/qpf/payload-manifest.json'));
if (manifest.schema !== 1 || manifest.release !== 'qpf-scenes-checkpoint-1' || !manifest.files) fail('payload manifest identity drifted');
for (const [relative, digest] of Object.entries(manifest.files)) {
  if (!fs.existsSync(path.join(root, ...relative.split('/')))) fail(`manifest target missing: ${relative}`);
  if (hash(relative) !== digest) fail(`payload integrity mismatch: ${relative}`);
}

const model = read('src/qpf/model.ts');
const controller = read('src/qpf/controller.ts');
const runtime = read('src/qpf/Qpf.tsx');
const host = read('src/broadcast-host/QpfHost.tsx');
const workspace = read('src/broadcast-host/RbrwxBroadcastWorkspace.tsx');
const catalog = read('src/broadcast-host/sceneCatalog.ts');
const currentHost = read('src/broadcast-host/CurrentWeatherHost.tsx');
const css = read('src/qpf/qpf.css');
const tauri = read('src-tauri/tauri.conf.json');
const providerVerifier = read('scripts/qpf/verify-provider.mjs');

for (const [key, layer] of [['qpf.day1', 1], ['qpf.day2', 2], ['qpf.day3', 3], ['qpf.day7', 11]]) {
  if (!catalog.includes(`contentKey: '${key}'`)) fail(`scene catalog missing ${key}`);
  if (!model.includes(`contentKey: '${key}'`) || !model.includes(`layerId: ${layer}`)) fail(`QPF model missing ${key} layer ${layer}`);
}
if (!controller.includes('https://mapservices.weather.noaa.gov/vector/rest/services/precip/wpc_qpf/MapServer')) fail('authoritative NOAA/WPC service URL missing');
for (const token of ["where: 'qpf > 0'", "outSR: '4326'", "f: 'geojson'", "outFields: 'product,valid_time,qpf,units,issue_time,start_time,end_time'"]) if (!controller.includes(token)) fail(`authoritative query contract missing ${token}`);
for (const [value, color] of [['0.01','#7fff00'],['0.1','#00ff00'],['0.25','#088b00'],['0.5','#104e8b'],['0.75','#1e90ff'],['1','#00b2ee'],['1.25','#00eeee'],['1.5','#8968cd'],['1.75','#912cee'],['2','#8b008b'],['2.5','#8b0000'],['3','#ff0000'],['4','#ee4000'],['5','#ff7f00'],['7','#ce8500'],['10','#ffd700'],['15','#ffff00'],['20','#ffc0b7']]) {
  if (!controller.toLowerCase().includes(`${value}, '${color}'`)) fail(`WPC QPF palette entry missing: ${value} ${color}`);
}
for (const token of ['QpfProvider','QpfMapConnection','QpfControls','QpfStatus']) if (!runtime.includes(token) && !host.includes(token)) fail(`QPF runtime missing ${token}`);
for (const token of ['<QpfHost>','<QpfMapConnection>','qpf: qpf.snapshot','new QpfController','releaseQpf(); releaseWeather();']) if (!workspace.includes(token)) fail(`main/capture integration missing ${token}`);
if (!workspace.includes("contentKey.startsWith('current.') || contentKey.startsWith('qpf.')")) fail('QPF scenes do not force the broadcast basemap');
if (!currentHost.includes("contentKey.startsWith('qpf.')")) fail('weather product selector does not release MAP selection for QPF scenes');
if (!tauri.includes('https://mapservices.weather.noaa.gov')) fail('Tauri CSP does not allow the WPC QPF provider');
if (!providerVerifier.includes('resultRecordCount') || !providerVerifier.includes('providerOrigins') || !providerVerifier.includes('service.serviceDescription') || providerVerifier.includes('service.description')) fail('live QPF provider/CORS/service metadata verifier is incomplete');
if (runtime.includes('position: absolute') || css.includes('position: absolute')) fail('QPF controls must not add map-overlay badges/legends/status panels');

const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
for (const match of noComments.matchAll(/([^{}]+)\{/g)) {
  const group = match[1].trim();
  if (!group || group.startsWith('@')) continue;
  for (const selector of group.split(',').map(value => value.trim()).filter(Boolean)) if (!selector.includes('.rbrwx-broadcast-workspace')) fail(`unscoped QPF CSS selector: ${selector}`);
}

for (const protectedPath of ['src/current-weather/controller.ts','src/current-weather/model.ts','src/current-weather/public-imagery.ts','src/map/BroadcastMap.tsx','src/map/broadcastMapStyle.ts']) {
  if (!fs.existsSync(path.join(root, ...protectedPath.split('/')))) fail(`protected module missing: ${protectedPath}`);
}

console.log('RBRWX QPF PASS: Day 1, Day 2, Day 3 and 7-Day WPC quantitative precipitation forecast scenes; official WPC layer IDs/colors; map + OBS capture integration; no map-overlay legend/status additions; protected current-weather/map modules retained.');
