import { readFile } from 'node:fs/promises';
import { fetchWithCors, providerOrigins } from '../provider-http.mjs';

const SERVICE_ROOT = 'https://mapservices.weather.noaa.gov/vector/rest/services/precip/wpc_qpf/MapServer';
const expectedLayers = [
  [1, 'QPF 24 Hour Day 1'],
  [2, 'QPF 24 Hour Day 2'],
  [3, 'QPF 24 Hour Day 3'],
  [11, 'QPF 168 Hour Day 1-7'],
];

const config = JSON.parse(await readFile(new URL('../../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
const origins = providerOrigins(config);
const csp = String(config.app?.security?.csp ?? '');
const connect = csp.split(';').map(value => value.trim()).find(value => value === 'connect-src' || value.startsWith('connect-src ')) ?? '';
if (!connect.includes('https://mapservices.weather.noaa.gov')) throw new Error('QPF provider: Tauri CSP connect-src does not allow mapservices.weather.noaa.gov.');

async function json(label, url) {
  const response = await fetchWithCors(label, url, 'application/json, application/geo+json', origins);
  try { return await response.json(); }
  catch (error) { throw new Error(`${label}: response was not valid JSON (${error instanceof Error ? error.message : String(error)}).`); }
}

const service = await json('WPC QPF service metadata', `${SERVICE_ROOT}?f=pjson`);
const mapName = String(service.mapName ?? '');
const serviceDescription = String(service.serviceDescription ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const copyrightText = String(service.copyrightText ?? '');
if (!mapName.toLowerCase().includes('quantitative precipitation forecast')) throw new Error(`QPF provider: unexpected service mapName ${mapName}.`);
if (!serviceDescription.toLowerCase().includes('quantitative precipitation forecast')) throw new Error('QPF provider: serviceDescription no longer identifies quantitative precipitation forecasts.');
if (!copyrightText.toLowerCase().includes('weather prediction center') || !copyrightText.toLowerCase().includes('wpc')) throw new Error('QPF provider: copyright metadata no longer identifies the Weather Prediction Center (WPC).');
if (!Array.isArray(service.layers)) throw new Error('QPF provider: service layer catalog is missing.');

for (const [layerId, expectedName] of expectedLayers) {
  const listed = service.layers.find(layer => Number(layer?.id) === layerId);
  if (!listed || String(listed.name) !== expectedName) throw new Error(`QPF provider: layer ${layerId} is no longer ${expectedName}.`);
  const layer = await json(`WPC QPF layer ${layerId} metadata`, `${SERVICE_ROOT}/${layerId}?f=pjson`);
  if (Number(layer.id) !== layerId || String(layer.name) !== expectedName) throw new Error(`QPF provider: layer ${layerId} identity changed.`);
  if (layer.geometryType !== 'esriGeometryPolygon') throw new Error(`QPF provider: layer ${layerId} is no longer polygon data.`);
  const formats = String(layer.supportedQueryFormats ?? '').toLowerCase();
  if (!formats.includes('geojson')) throw new Error(`QPF provider: layer ${layerId} no longer advertises GeoJSON queries.`);
  const fields = new Set((layer.fields ?? []).map(field => field?.name));
  for (const field of ['qpf', 'product', 'units', 'issue_time', 'start_time', 'end_time', 'valid_time']) {
    if (!fields.has(field)) throw new Error(`QPF provider: layer ${layerId} is missing field ${field}.`);
  }
  const params = new URLSearchParams({
    where: 'qpf > 0',
    outFields: 'product,valid_time,qpf,units,issue_time,start_time,end_time',
    returnGeometry: 'true',
    resultRecordCount: '1',
    outSR: '4326',
    geometryPrecision: '4',
    f: 'geojson',
  });
  const sample = await json(`WPC QPF layer ${layerId} GeoJSON`, `${SERVICE_ROOT}/${layerId}/query?${params}`);
  if (sample.type !== 'FeatureCollection' || !Array.isArray(sample.features) || sample.features.length < 1) throw new Error(`QPF provider: layer ${layerId} GeoJSON query returned no forecast feature.`);
  const feature = sample.features[0];
  if (!['Polygon', 'MultiPolygon'].includes(feature?.geometry?.type)) throw new Error(`QPF provider: layer ${layerId} sample geometry is not Polygon/MultiPolygon.`);
  if (!(Number(feature?.properties?.qpf) > 0)) throw new Error(`QPF provider: layer ${layerId} sample has no positive qpf value.`);
}

const day1 = await json('WPC QPF Day 1 renderer', `${SERVICE_ROOT}/1?f=pjson`);
const rendererText = JSON.stringify(day1.drawingInfo?.renderer ?? {});
for (const signature of ['127,255,0,255', '0,178,238,255', '255,0,0,255', '255,192,183,255']) {
  if (!rendererText.includes(`[${signature}]`)) throw new Error(`QPF provider: official Day 1 renderer color ${signature} is missing.`);
}

console.log('RBRWX live WPC QPF provider preflight: PASS');
console.log(`  CORS origins: ${origins.join(', ')}`);
console.log('  Layers: 1 Day 1, 2 Day 2, 3 Day 3, 11 Day 1-7');
