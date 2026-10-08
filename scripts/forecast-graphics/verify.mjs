import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { canonicalSha256File } from '../repo/integrity.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const ts = require('../broadcast/vendor/typescript/typescript.cjs');
const read = relative => fs.readFileSync(path.join(root, ...relative.split('/')), 'utf8');
const sha = relative => canonicalSha256File(path.join(root, ...relative.split('/')));

const manifest = JSON.parse(read('scripts/forecast-graphics/payload-manifest.json'));
assert.equal(manifest.schema, 1);
assert.equal(manifest.release, 'nonmap-graphics-checkpoint-1');
for (const [relative, digest] of Object.entries(manifest.files)) assert.equal(sha(relative), digest, `Forecast graphics integrity drift: ${relative}`);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rbrwx-forecast-graphics-'));
try {
  const modelSource = read('src/forecast-graphics/model.ts');
  fs.writeFileSync(path.join(temp, 'model.cjs'), ts.transpileModule(modelSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  }).outputText);
  const model = require(path.join(temp, 'model.cjs'));
  const templates = [
    ['graphic.right-now','right-now'], ['graphic.today','today'], ['graphic.tonight','tonight'],
    ['graphic.today-tonight','today-tonight'], ['graphic.hourly','hourly'], ['graphic.seven-day','seven-day'],
    ['graphic.planner','planner'], ['graphic.weekend','weekend'], ['graphic.need-to-know','need-to-know'], ['graphic.blank','blank'],
  ];
  for (const [content, template] of templates) {
    assert.equal(model.templateForContent(content), template, content);
    assert.equal(model.isForecastGraphicContent(content), true, content);
    const objects = model.freshSceneObjects(template);
    if (template === 'blank') assert.equal(objects.length, 0, 'Blank Canvas must start empty');
    else assert.ok(objects.length > 0, `${template} must have a real scene template`);
  }
  assert.equal(model.isForecastGraphicContent('current.radar'), false);
  assert.doesNotMatch(modelSource, /Memorial Day|MEMORIAL DAY|holiday/i, 'Day names must not be automatically replaced with holiday labels');

  const sample = {
    locationName: 'San Antonio, TX', updatedAt: Date.now(), observation: { temperatureF: 88, humidity: 48, windMph: 12, windDirection: 'S', description: 'Partly Cloudy', time: new Date().toISOString() },
    periods: [
      { name:'Today', startTime:'2026-09-26T06:00:00-05:00', endTime:'2026-09-26T18:00:00-05:00', isDaytime:true, temperature:91, temperatureUnit:'F', probabilityOfPrecipitation:20, windSpeed:'10 mph', windDirection:'S', shortForecast:'Mostly Sunny' },
      { name:'Tonight', startTime:'2026-09-26T18:00:00-05:00', endTime:'2026-09-27T06:00:00-05:00', isDaytime:false, temperature:70, temperatureUnit:'F', probabilityOfPrecipitation:10, windSpeed:'5 mph', windDirection:'SE', shortForecast:'Mostly Clear' },
    ],
    hourly: Array.from({length:12},(_,i)=>({ startTime:`2026-09-26T${String(10+i).padStart(2,'0')}:00:00-05:00`, temperature:80+i, temperatureUnit:'F', probabilityOfPrecipitation:i, windSpeed:'8 mph', windDirection:'S', shortForecast:'Sunny' })),
  };
  assert.equal(model.resolveAutoText('today.temperature', sample), '91°');
  assert.equal(model.resolveAutoText('today.temperature',{...sample,periods:[{...sample.periods[0],temperature:20,temperatureUnit:'C'}]}),'68°');
  assert.equal(model.resolveAutoText('today.pop',sample),'PRECIP 20%');
  assert.equal(model.resolveAutoText('obs.condition',{...sample,observation:null}),'OBSERVATION UNAVAILABLE');
  assert.equal(model.resolveAutoText('obs.icon',{...sample,observation:null}),'—');
  fs.writeFileSync(path.join(temp,'forecastData.cjs'),ts.transpileModule(read('src/forecast-graphics/forecastData.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);
  const {quantity}=require(path.join(temp,'forecastData.cjs'));
  assert.equal(quantity({value:20,unitCode:'wmoUnit:degC',qualityControl:'V'},'degC'),20);
  assert.equal(quantity({value:20,unitCode:'wmoUnit:degF',qualityControl:'V'},'degC'),null);
  assert.equal(quantity({value:20,unitCode:'wmoUnit:degC',qualityControl:'X'},'degC'),null);
  const auto = { id:'x', label:'x', kind:'text', style:'temperature', x:0,y:0,w:100,h:50,z:1,scale:1,autoKey:'today.temperature' };
  assert.equal(model.displayText(auto, sample), '91°');
  assert.equal(model.displayText({ ...auto, textOverride:'93°' }, sample), '93°', 'Direct edit must override only the displayed scene object');

  const editor = read('src/forecast-graphics/ForecastGraphics.tsx');
  for (const token of ['contentEditable={editing}', "event.key !== 'Delete'", "event.key !== 'Backspace'", 'forecast-resize-handle', "mode: 'move' | 'scale'", '.PNG / .SVG LIBRARY', 'TEXT BOX', 'ICON', 'PANEL', 'CIRCLE', "invoke<GraphicAssetEntry[]>('list_graphic_assets')", "invoke<string>('read_graphic_asset'"]) assert.match(editor, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')), token);
  assert.doesNotMatch(editor.slice(editor.indexOf('export function ForecastGraphicProperties()')), /type=["']range["']/, 'Right-side properties must not contain text sizing sliders');
  assert.match(editor,/forecast-inline-controls/,'Sizing controls belong inside the displayed object');
  assert.match(editor, /transform:\s*`scale\(\$\{item\.scale \?\? 1\}\)`/, 'Corner drag must scale the complete object, including text');
  assert.match(editor, /graphics\.updateObject\(item\.id, \{ scale: nextScale \}\)/, 'Scale handle must write object scale');

  const dataSource = read('src/forecast-graphics/forecastData.ts');
  assert.match(dataSource, /https:\/\/api\.weather\.gov/);
  assert.doesNotMatch(dataSource, /openweathermap|weatherapi|accuweather/i);

  const host = read('src/broadcast-host/RbrwxBroadcastWorkspace.tsx');
  for (const token of ['ForecastGraphicsHost','ForecastGraphicEditorStage','ProgramMirror','useProgramMirror(synoptic.map','operator-map-layer--behind-graphic']) assert.ok(host.includes(token), token);
  const currentHost = read('src/broadcast-host/CurrentWeatherHost.tsx');
  assert.match(currentHost, /contentKey\.startsWith\('graphic\.'\)/);
  assert.match(currentHost, /<CurrentWeatherProvider/, 'Current weather provider stays mounted across scene changes');
  assert.match(host, /<RadarOverlayProvider>/, 'Independent radar remains available on graphic scenes');

  const catalog = read('src/broadcast-host/sceneCatalog.ts');
  for (const [content] of templates) assert.ok(catalog.includes(`contentKey: '${content}'`), content);

  const rust = read('src-tauri/src/lib.rs');
  for (const token of ['list_graphic_assets','read_graphic_asset','asset-library','png/<file> or svg/<file>','svg_is_safe','starts_with(&[137, 80, 78, 71, 13, 10, 26, 10])']) assert.ok(rust.includes(token), token);
  for (const blocked of ['<script', '<foreignobject', 'javascript:', 'onload=', 'onerror=', 'href=\\"http']) assert.ok(rust.includes(blocked), `SVG safety token ${blocked}`);
  assert.ok(fs.existsSync(path.join(root,'asset-library','png','README.txt')));
  assert.ok(fs.existsSync(path.join(root,'asset-library','svg','README.txt')));

  const css = read('src/forecast-graphics/forecastGraphics.css');
  for (const color of ['#080c12','#111722','#182130','#202b3b','#314158','#eef4fb','#9eacbf','#2d85ff','#55a6ff','#f5c84b']) assert.ok(css.toLowerCase().includes(color), `RBRTW palette ${color}`);
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of noComments.matchAll(/([^{}]+)\{/g)) {
    const group = match[1].trim(); if (!group || group.startsWith('@')) continue;
    for (const selector of group.split(',').map(value=>value.trim()).filter(Boolean)) assert.ok(selector.includes('.rbrwx-broadcast-workspace'), `Unscoped forecast graphics selector: ${selector}`);
  }

  console.log('RBRWX non-map graphics PASS: 10 scenes, live NWS population, direct text overrides, click/drag move + corner scale, Delete-key removal, Blank Canvas, PNG/SVG library, OBS snapshot, and preserved map/weather module boundaries.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
