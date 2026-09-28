import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { runContractAudit } from './contracts.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

const expectedWarnings = new Set([
  'OBS-IDW-SURFACE',
  'RADAR-SWEEP-SYNTHETIC',
  'FORECAST-FIXED-LOCATION',
  'FORECAST-FETCH-TIME',
  'FORECAST-QUANTITY-UNITS-QC',
  'FORECAST-OBS-FALLBACK',
  'FORECAST-TEMP-UNIT-DISPLAY',
  'FORECAST-POP-LABEL',
  'QPF-AUTO-REFRESH',
  'QPF-VALIDITY-EXPRESSION',
]);

test('implemented weather source contracts contain no unidentified FAIL condition', () => {
  const { findings } = runContractAudit(root, { print: false });
  const failures = findings.filter(item => item.status === 'FAIL');
  assert.deepEqual(failures, []);
});

test('known weather correctness gaps remain explicitly tracked until repaired', () => {
  const { findings } = runContractAudit(root, { print: false });
  const warnings = new Set(findings.filter(item => item.status === 'WARN').map(item => item.id));
  assert.deepEqual([...warnings].sort(), [...expectedWarnings].sort());
});

test('authoritative implemented providers remain represented in deterministic audit', () => {
  const { findings } = runContractAudit(root, { print: false });
  const ids = new Set(findings.map(item => item.id));
  for (const id of ['OBS-UNITS-QC','OBS-VIEWPORT','RADAR-SITE-DISCOVERY','RADAR-FRAME-SWAP','MRMS-BACKUP','SATELLITE-B14','FORECAST-NWS-ENDPOINTS','QPF-LAYERS','QPF-SCHEMA','TAURI-WEATHER-CSP']) {
    assert.ok(ids.has(id), `missing deterministic audit item ${id}`);
  }
});

test('Baron-parity missing product families are roadmap items, not false failures', () => {
  const { roadmap } = runContractAudit(root, { print: false });
  const joined = roadmap.join('\n').toLowerCase();
  for (const term of ['fronts','alerts','tropical','snow/ice','lightning','rtma/urma','hrrr']) assert.match(joined, new RegExp(term.replace('/','\\/'), 'i'));
});


test('satellite contract recognizes the shared nowCOAST service object without requiring a product literal', async () => {
  const fs = await import('node:fs');
  const fsp = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const temp = await fsp.mkdtemp(path.join(os.tmpdir(), 'rbrwx-satellite-contract-'));
  try {
    const target = path.join(temp, 'src', 'current-weather');
    await fsp.mkdir(target, { recursive: true });
    await fsp.writeFile(path.join(target, 'public-imagery.ts'), `export const services = {
  radar: { url: 'https://nowcoast.noaa.gov/geoserver/observations/weather_radar/wms', layer: 'conus_base_reflectivity_mosaic' },
  satellite: { url: 'https://nowcoast.noaa.gov/geoserver/satellite/wms', layer: 'goes_longwave_imagery' },
};
export class PublicImagery { async setSatelliteTimestamp(time) { return time; } }
`, 'utf8');
    const { findings } = runContractAudit(temp, { print: false });
    const satellite = findings.find(item => item.id === 'SATELLITE-B14');
    assert.ok(satellite, 'SATELLITE-B14 finding missing');
    assert.equal(satellite.status, 'PASS', satellite.detail);
  } finally {
    await fsp.rm(temp, { recursive: true, force: true });
  }
});

test('live-audit failure summarizer reports the real assertion instead of the trailing Node version', async () => {
  const { summarizeProcessFailure } = await import('./audit.mjs');
  const sample = `AssertionError [ERR_ASSERTION]: KEWX kewx_sr_bref did not return PNG imagery\n    at file:///tmp/provider-radar.mjs:145:8\nNode.js v24.18.0\n`;
  assert.equal(summarizeProcessFailure(sample, 1), 'KEWX kewx_sr_bref did not return PNG imagery');
});

test('radar frame assessment rejects corrupt newest frames and stale renderable fallbacks', async () => {
  const { assessRadarFrames } = await import('./audit.mjs');
  const now = Date.parse('2026-09-27T18:43:00.000Z');
  const times = [
    '2026-09-27T05:59:29.000Z','2026-09-27T05:52:27.000Z','2026-09-27T05:45:25.000Z','2026-09-27T05:38:23.000Z',
    '2026-09-27T05:31:20.000Z','2026-09-27T05:24:18.000Z','2026-09-27T05:17:16.000Z','2026-09-27T05:10:13.000Z',
    '2026-09-27T05:03:10.000Z','2026-09-27T04:56:08.000Z','2026-09-27T04:49:05.000Z','2026-09-27T04:42:02.000Z',
  ].map(Date.parse);
  const frames = times.map((time, index) => ({ time, ok: index === 9 || index === 10, bytes: index === 9 || index === 10 ? 1670 : undefined, reason: index === 0 ? 'GeoServer could not render advertised radar granule' : 'service exception' }));
  const assessment = assessRadarFrames({ times, frames, now });
  assert.equal(assessment.status, 'FAIL');
  assert.match(assessment.detail, /2\/12 advertised frames rendered/);
  assert.match(assessment.detail, /no renderable frame is within the current-radar age limit/);
  assert.match(assessment.detail, /GeoServer could not render advertised radar granule/);
});
