import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = new URL('../../', import.meta.url);
const require = createRequire(import.meta.url);
const ts = require('../broadcast/vendor/typescript/typescript.cjs');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rbrwx-radar-sites-test-'));

try {
  for (const file of ['model', 'observations', 'public-imagery']) {
    const input = fs.readFileSync(new URL(`src/current-weather/${file}.ts`, root), 'utf8');
    fs.writeFileSync(path.join(temp, `${file}.js`), ts.transpileModule(input, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
    }).outputText);
  }

  const model = require(path.join(temp, 'model.js'));
  const observations = require(path.join(temp, 'observations.js'));
  const radar = require(path.join(temp, 'public-imagery.js'));

  assert.equal(model.defaultOptions().mrmsEnabled, false, 'MRMS must be backup-only/off by default');
  assert.equal(model.temperatureLabel(0, 'imperial'), '32°');
  assert.equal(model.temperatureLabel(25, 'metric'), '25°');
  assert.equal(model.temperatureLabel(null, 'imperial'), '');

  const lowCap = observations.observationStationCap(4);
  const regionalCap = observations.observationStationCap(7);
  const localCap = observations.observationStationCap(10);
  assert.ok(lowCap < regionalCap && regionalCap < localCap, 'Observation station density must increase with zoom');
  assert.equal(observations.observationSamplePoints({ west: -110, east: -90, south: 25, north: 40, zoom: 4 }).length, 9, 'Wide views must discover stations across the viewport instead of one center WFO');
  assert.equal(observations.observationSamplePoints({ west: -102, east: -95, south: 27, north: 33, zoom: 6 }).length, 5, 'Regional views must sample the viewport, not just its center');
  assert.equal(observations.observationSamplePoints({ west: -100, east: -97, south: 28, north: 31, zoom: 8 }).length, 9, 'Local views must use the denser viewport sample grid');
  const distributed = observations.selectDistributedStations([
    { id: 'NW', lng: -99.8, lat: 30.8 }, { id: 'NE', lng: -97.2, lat: 30.8 }, { id: 'SW', lng: -99.8, lat: 28.2 }, { id: 'SE', lng: -97.2, lat: 28.2 },
    ...Array.from({ length: 20 }, (_, i) => ({ id: `C${i}`, lng: -98.55 + i * .005, lat: 29.45 + i * .002 })),
  ], { west: -100, east: -97, south: 28, north: 31, zoom: 6 }, 8);
  for (const id of ['NW', 'NE', 'SW', 'SE']) assert.ok(distributed.some(item => item.id === id), `Distributed station selection must retain viewport coverage at ${id}`);

  const originalFetch = globalThis.fetch;
  let pointCount = 0;
  globalThis.fetch = async url => {
    const address = String(url);
    if (address.includes('/points/')) {
      pointCount++;
      const suffix = pointCount === 2 ? 'stations-bad' : 'stations-good';
      return new Response(JSON.stringify({ properties: { observationStations: `https://api.weather.gov/${suffix}` } }), { status: 200 });
    }
    if (address.endsWith('/stations-bad')) return new Response('temporary upstream failure', { status: 503 });
    if (address.endsWith('/stations-good')) return new Response(JSON.stringify({ features: [
      { properties: { stationIdentifier: 'KAAA', name: 'NW' }, geometry: { coordinates: [-99.7, 30.7] } },
      { properties: { stationIdentifier: 'KBBB', name: 'NE' }, geometry: { coordinates: [-97.3, 30.7] } },
      { properties: { stationIdentifier: 'KCCC', name: 'SW' }, geometry: { coordinates: [-99.7, 28.3] } },
      { properties: { stationIdentifier: 'KDDD', name: 'SE' }, geometry: { coordinates: [-97.3, 28.3] } },
    ] }), { status: 200 });
    if (address.includes('/observations/latest')) return new Response(JSON.stringify({ properties: { timestamp: new Date().toISOString(), temperature: { value: 25, unitCode: 'wmoUnit:degC' } } }), { status: 200 });
    throw new Error(`Unexpected observation URL ${address}`);
  };
  try {
    const client = new observations.ObservationsClient();
    const loaded = await client.loadViewport({ west: -100, east: -97, south: 28, north: 31, zoom: 6 }, new AbortController().signal);
    assert.equal(loaded.length, 4, 'One failed regional station collection must not cancel successful station collections');
  } finally {
    globalThis.fetch = originalFetch;
  }

  const supplied = fs.readFileSync(new URL('src/current-weather/RadarScope1.pal', root), 'utf8').replace(/\r\n/g, '\n').trimEnd();
  assert.equal(radar.RADARSCOPE_REFLECTIVITY_PAL.replace(/\r\n/g, '\n').trimEnd(), supplied, 'Embedded radar palette must exactly match supplied RadarScope1.pal');
  const sld = radar.radarScopeSld('SR_BREF');
  assert.ok(sld.includes('color="#fbfc00" quantity="37.5"'), '37.5 dBZ must start at the supplied first RGB');
  assert.ok(sld.includes('color="#c7b000" quantity="42.499"'), '37.5 dBZ second RGB must be the end of the 37.5→42.5 gradient');
  assert.ok(sld.includes('color="#fd9502" quantity="42.5"'), '42.5 dBZ must jump to the supplied 42.5 first RGB');
  assert.ok(!sld.includes('color="#ac5c02" quantity="42.499"'), 'The next breakpoint second RGB must never be borrowed for the previous gradient');

  const capabilityFixture = `<?xml version="1.0"?><WMS_Capabilities><Capability><Layer><Layer><Name>kewx_bdhc</Name><Abstract>Hydrometeor Classification</Abstract><Dimension name="time">2026-09-14T21:20:00Z</Dimension></Layer><Layer><Name>kewx_sr_bref</Name><Abstract>NEXRAD Super Resolution Base Reflectivity</Abstract><Dimension name="time">2026-09-14T21:15:00Z,2026-09-14T21:20:00Z</Dimension></Layer></Layer></Capability></WMS_Capabilities>`;
  const discoveredLayer = radar.radarReflectivityLayer(capabilityFixture, 'KEWX');
  assert.equal(discoveredLayer, 'kewx_sr_bref', 'Radar product label SR_BREF must be resolved to the site-qualified WMS layer name');

  const styled = new URL(radar.radarImageRequest('KEWX', discoveredLayer, 1700000000000, [-1, -2, 3, 4], 1000, 600, true));
  assert.equal(styled.hostname, 'opengeo.ncep.noaa.gov');
  assert.equal(styled.pathname, '/geoserver/kewx/ows');
  assert.equal(styled.searchParams.get('LAYERS'), 'kewx_sr_bref');
  assert.equal(styled.searchParams.get('TIME'), '2023-11-14T22:13:20.000Z');
  assert.ok(styled.searchParams.get('SLD_BODY')?.includes('StyledLayerDescriptor'));
  const fallback = new URL(radar.radarImageRequest('KEWX', discoveredLayer, 1700000000000, [-1, -2, 3, 4], 1000, 600, false));
  assert.equal(fallback.searchParams.has('SLD_BODY'), false);

  const originalRadarFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    features: [
      { geometry: { coordinates: [-98.028611, 29.704056] }, properties: { rda_id: 'KEWX', name: 'Austin/San Antonio', wfo_id: 'EWX' } },
      { geometry: { coordinates: [-96.918, 33.065] }, properties: { rda_id: 'TDFW', name: 'Dallas-Fort Worth Airport', wfo_id: 'FWD' } },
      { geometry: { coordinates: [-159.5525, 21.8939] }, properties: { rda_id: 'PHKI', name: 'South Kauai', wfo_id: 'HFO' } },
    ],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    const sites = await radar.fetchRadarSites(new AbortController().signal);
    assert.equal(sites[0].id, 'KEWX');
    assert.equal(sites[0].city, 'San Antonio / Austin');
    assert.equal(sites[0].wfo, 'EWX');
    assert.ok(sites.some(site => site.id === 'PHKI'), 'Supported WSR-88D P-prefix sites must remain available');
    assert.ok(!sites.some(site => site.id === 'TDFW'), 'TDWR sites must not be offered as SR_BREF WSR-88D selections');
  } finally {
    globalThis.fetch = originalRadarFetch;
  }

  // MRMS is subordinate to the primary site timeline. It must choose the nearest
  // published MRMS frame when site and mosaic timestamps are not identical.
  const mosaic = new radar.PublicImagery({}, { product: 'radar', anchor: 'anchor', opacity: .4, onError() {} });
  mosaic.times = [1_000_000, 1_300_000, 1_600_000];
  let nearestLoaded = null;
  mosaic.load = async time => { nearestLoaded = time; };
  await mosaic.setMRMSTimestamp(1275);
  assert.equal(nearestLoaded, 1_300_000, 'MRMS playback must choose the nearest advertised mosaic frame');

  // Site and MRMS loads must be advanced together by RadarImagery playback.
  const siteManager = new radar.RadarImagery({}, { product: 'radar', anchor: 'anchor', opacity: .85, onError() {} });
  siteManager.activeIds = ['KEWX'];
  siteManager.runtimes.set('KEWX', { layer: 'kewx_sr_bref', times: [1_200_000, 1_300_000], selected: 1_200_000, activeLayer: null, serial: 0 });
  const synchronized = [];
  siteManager.loadSite = async (_id, time) => { synchronized.push(['site', time]); };
  siteManager.mosaic = { setMRMSTimestamp: async time => { synchronized.push(['mrms', time]); } };
  await siteManager.setMRMSTimestamp(1300);
  assert.deepEqual(synchronized.sort((a, b) => String(a[0]).localeCompare(String(b[0]))), [['mrms', 1300], ['site', 1_300_000]], 'Radar playback must advance both the site radar and enabled MRMS backup');

  const radarSource = fs.readFileSync(new URL('src/current-weather/public-imagery.ts', root), 'utf8');
  const controllerSource = fs.readFileSync(new URL('src/current-weather/controller.ts', root), 'utf8');
  assert.match(radarSource, /private activeIds: string\[\] = \['KEWX'\]/, 'KEWX must be the default primary radar');
  assert.match(radarSource, /radarReflectivityLayer\(capabilities, id\)/, 'Runtime must discover the site-qualified SR_BREF WMS layer from capabilities');
  assert.doesNotMatch(radarSource, /LAYERS:\s*'SR_BREF'/, 'Runtime must not assume the product label SR_BREF is the literal WMS layer name');
  assert.match(radarSource, /slice\(0, 3\)/, 'Radar selection must enforce the three-site maximum');
  assert.match(radarSource, /current\.end \?\? next\.start/, 'Palette gradient interpolation must use the current breakpoint second RGB');
  assert.match(radarSource, /paletteFallbackSites/, 'Palette fallback state must be tracked by radar site instead of sticking globally forever');
  assert.match(radarSource, /sweepFillLayer[\s\S]*this\.markerLayer/, 'Sweep overlays must be inserted below radar tower markers');
  assert.match(radarSource, /private mosaicAnchor\(\)[\s\S]*firstSiteLayer[\s\S]*sweepFillLayer/, 'MRMS inserted at runtime must remain below site radar and sweep layers');
  assert.match(radarSource, /this\.map\.on\('sourcedata', loaded\)/, 'New radar images must wait for MapLibre source load before replacing the previous frame');
  assert.match(radarSource, /queryRenderedFeatures\(event\.point, \{ layers: \[this\.markerLabelLayer, this\.markerLayer\] \}\)/, 'Tower and label clicks must use one click path to prevent double toggles');
  assert.match(radarSource, /if \(!id\) \{ await this\.applyRadarSelection\(\[\]\); return; \}/, 'No-primary selection must actually clear site radars');
  assert.match(controllerSource, /const reload = scene !== this\.scene \|\| product !== this\.product \|\| apiKey !== this\.apiKey;/, 'Changing MRMS backup must not rebuild the site-radar manager and lose selected sites');
  assert.doesNotMatch(controllerSource, /const reload[^;]*mrmsEnabled/, 'MRMS toggle must not be part of the full-manager reload condition');
  assert.match(controllerSource, /setMRMSEnabled\?\./, 'Controller must update MRMS backup in place');
  assert.match(controllerSource, /manager\.destroy\(\); this\.manager = null;/, 'A manager that fails initialization must be destroyed instead of leaking listeners or timers');
  assert.match(controllerSource, /key\.id === 'nws\.ndfd\.temperature'/, 'Temperature field must use the verified absolute NWS NDFD temperature key');
  assert.match(controllerSource, /observation\.temperature \* 9 \/ 5 \+ 32/, 'Observed Celsius temperatures must be converted to Fahrenheit before absolute NWS temperature-palette lookup');
  assert.match(controllerSource, /temperatureRgba\(weighted \/ weights\)/, 'Temperature raster color must be selected from the absolute Fahrenheit value, not viewport-relative min/max');
  assert.match(controllerSource, /type: 'image'/, 'Temperature field must use one image source instead of visible square GeoJSON cells');
  assert.match(controllerSource, /type: 'raster'/, 'Temperature image source must render as a raster layer');
  assert.match(controllerSource, /'raster-resampling': 'linear'/, 'Temperature raster must use linear resampling to avoid visible pixel-cell boundaries');
  assert.doesNotMatch(controllerSource, /geometry: \{ type: 'Polygon'.*tempF/s, 'Temperature field must not return to polygon grid cells');
  assert.match(controllerSource, /properties: \{ label \}/, 'Map observation features must carry only the temperature label');
  assert.doesNotMatch(controllerSource, /properties:\s*\{\s*label:\s*`\$\{o\.id\}/, 'Station IDs must not be rendered with temperatures');

  console.log('Radar sites PASS: wide/regional/local viewport discovery, zoom-aware temperature density, seamless absolute-palette temperature raster, temperature-only labels, MRMS backup default and synchronized playback, exact supplied palette gradient semantics, dynamic site-qualified SR_BREF layer discovery, per-site fallback state, WSR-88D-only site filtering, safe MapLibre frame swaps, in-place MRMS toggle, KEWX mapping and three-site cap contract.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
