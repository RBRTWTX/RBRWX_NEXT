import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = new URL('../../', import.meta.url);
const require = createRequire(import.meta.url);
const ts = require('../broadcast/vendor/typescript/typescript.cjs');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rbrwx-humidity-heat-index-test-'));

const near = (actual, expected, tolerance, message) => {
  assert.ok(typeof actual === 'number' && Number.isFinite(actual), `${message}: expected a finite number, got ${String(actual)}`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected} ± ${tolerance}, got ${actual}`);
};

try {
  for (const file of ['model', 'observations']) {
    const input = fs.readFileSync(new URL(`src/current-weather/${file}.ts`, root), 'utf8');
    fs.writeFileSync(path.join(temp, `${file}.js`), ts.transpileModule(input, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
    }).outputText);
  }

  const model = require(path.join(temp, 'model.js'));
  const observations = require(path.join(temp, 'observations.js'));

  assert.equal(model.defaultOptions().currentField, 'temperature', 'Temperature must remain the default Current Conditions field');
  assert.deepEqual(Object.keys(model.currentConditionTitles), ['temperature', 'humidity', 'heatIndex']);

  near(model.relativeHumidityFromTemperatureDewpoint(30, 20), 55.04, .08, '30C/20C relative humidity');
  near(model.relativeHumidityFromTemperatureDewpoint(25, 20), 73.78, .08, '25C/20C relative humidity');
  assert.equal(model.relativeHumidityFromTemperatureDewpoint(null, 20), null);

  // Public NWS examples: 100F/55% -> about 124F; 96F/65% -> about 121F.
  assert.equal(Math.round(model.nwsHeatIndexF(100, 55)), 124, 'NWS Heat Index example 100F/55%');
  assert.equal(Math.round(model.nwsHeatIndexF(96, 65)), 121, 'NWS Heat Index example 96F/65%');
  near(model.nwsHeatIndexF(75, 50), 74.775, .001, 'NWS simple-formula path below 80F');
  assert.equal(model.nwsHeatIndexF(null, 50), null);

  const direct = {
    id: 'KAAA', name: 'Direct', lng: -98, lat: 29, time: Date.now(),
    temperature: 35, dewpoint: 24, wind: null, gust: null, humidity: 55,
    heatIndex: 40, description: 'Hot', cached: false,
  };
  near(model.observationHeatIndexF(direct), 104, .001, 'Direct NWS heatIndex must be preferred');
  assert.equal(model.heatIndexLabel(direct, 'imperial'), '104°');
  assert.equal(model.heatIndexLabel(direct, 'metric'), '40°');
  assert.equal(model.humidityLabel(direct), '55%');

  const fallback = { ...direct, humidity: null, heatIndex: null, temperature: 35, dewpoint: 23 };
  assert.ok(model.observationHumidity(fallback) > 45 && model.observationHumidity(fallback) < 55, 'Humidity fallback must derive from observed temperature/dewpoint');
  assert.ok(model.observationHeatIndexF(fallback) > 100, 'Heat Index fallback must use observed temperature + RH');

  const parsed = observations.parseObservation({ properties: {
    timestamp: '2026-09-26T15:00:00Z',
    temperature: { value: 35, unitCode: 'wmoUnit:degC', qualityControl: 'V' },
    dewpoint: { value: 24, unitCode: 'wmoUnit:degC', qualityControl: 'V' },
    windSpeed: { value: 8, unitCode: 'wmoUnit:km_h-1', qualityControl: 'V' },
    windGust: { value: null, unitCode: 'wmoUnit:km_h-1', qualityControl: 'Z' },
    relativeHumidity: { value: 55.4, unitCode: 'wmoUnit:percent', qualityControl: 'V' },
    heatIndex: { value: 40.2, unitCode: 'wmoUnit:degC', qualityControl: 'V' },
    textDescription: 'Hot',
  } }, { id: 'KAAA', name: 'Test', lng: -98, lat: 29 });
  assert.ok(parsed);
  near(parsed.humidity, 55.4, .001, 'NWS relativeHumidity parse');
  near(parsed.heatIndex, 40.2, .001, 'NWS heatIndex parse');

  const qcRejected = observations.parseObservation({ properties: {
    timestamp: '2026-09-26T15:00:00Z',
    temperature: { value: 35, unitCode: 'wmoUnit:degC', qualityControl: 'V' },
    dewpoint: { value: 24, unitCode: 'wmoUnit:degC', qualityControl: 'V' },
    relativeHumidity: { value: 55.4, unitCode: 'wmoUnit:percent', qualityControl: 'X' },
    heatIndex: { value: 40.2, unitCode: 'wmoUnit:degC', qualityControl: 'Z' },
  } }, { id: 'KBBB', name: 'QC', lng: -98, lat: 29 });
  assert.ok(qcRejected);
  assert.equal(qcRejected.humidity, null, 'Rejected NWS RH QC must not be rendered');
  assert.equal(qcRejected.heatIndex, null, 'Rejected NWS heat-index QC must not be rendered');

  const controllerSource = fs.readFileSync(new URL('src/current-weather/controller.ts', root), 'utf8');
  const controlsSource = fs.readFileSync(new URL('src/current-weather/CurrentWeather.tsx', root), 'utf8');
  const cssSource = fs.readFileSync(new URL('src/current-weather/weather.css', root), 'utf8');

  assert.match(controllerSource, /buildCurrentFieldImage/, 'Current Conditions fields must share the continuous raster renderer');
  assert.match(controllerSource, /const humidityStops/, 'Humidity must use a fixed absolute palette');
  assert.match(controllerSource, /const heatIndexStops/, 'Heat Index must use a fixed absolute palette');
  for (const threshold of ['80', '90', '103', '125']) assert.match(controllerSource, new RegExp(`value:\\s*${threshold}`), `Heat Index palette must preserve NWS ${threshold}F breakpoint`);
  assert.match(controllerSource, /observationHumidity\(observation\)/, 'Humidity renderer must use direct-or-derived observation humidity');
  assert.match(controllerSource, /observationHeatIndexF\(observation\)/, 'Heat Index renderer must use direct-NWS-or-NWS-formula values');
  assert.match(controllerSource, /type:\s*'image'/);
  assert.match(controllerSource, /type:\s*'raster'/);
  assert.match(controllerSource, /'raster-resampling':\s*'linear'/);
  assert.doesNotMatch(controllerSource, /geometry:\s*\{\s*type:\s*'Polygon'/s, 'Humidity/Heat Index must not reintroduce square grid polygons');
  assert.match(controllerSource, /properties:\s*\{\s*label\s*\}/, 'Observation map features must remain value-only');
  assert.doesNotMatch(controllerSource, /properties:\s*\{[^}]*\bid\b/s, 'Observation map features must not expose station IDs');
  assert.match(controllerSource, /const reload = scene !== this\.scene \|\| product !== this\.product \|\| apiKey !== this\.apiKey;/, 'Field switching must not restart Current Conditions');
  assert.doesNotMatch(controllerSource, /const reload[^;]*currentField/, 'Current Conditions field must switch in place without a full data reload');

  assert.match(controlsSource, /\['temperature', 'humidity', 'heatIndex'\]/, 'Operator must have Temperature/Humidity/Heat Index data-layer buttons');
  assert.match(controlsSource, /aria-pressed=\{options\.currentField === field\}/, 'Current data layer must be visibly selected');
  assert.match(controlsSource, /options\.currentField\]\);/, 'Current-field option must participate in controller updates');
  assert.match(cssSource, /\.wx-condition-picker/, 'Current Conditions data-layer picker styling is missing');
  assert.doesNotMatch(cssSource, /\.wx-weather-status\s*\{[^}]*position:\s*absolute/s, 'Diagnostics must not return to the live map');

  console.log('Humidity / Heat Index PASS: direct NWS values, RH fallback, official NWS Heat Index procedure, QC handling, absolute palettes, value-only labels, in-place operator switching, and continuous raster rendering.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
