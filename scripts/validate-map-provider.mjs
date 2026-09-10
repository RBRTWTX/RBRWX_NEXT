import { readFile } from 'node:fs/promises';
import { fetchWithCors, providerOrigins } from './provider-http.mjs';

const config = JSON.parse(await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
const origins = providerOrigins(config);
console.log(`Provider CORS origins: ${origins.join(', ')}`);

const TILEJSON = 'https://tiles.openfreemap.org/planet';
const SPRITE_JSON = 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm.json';
const GLYPHS = [
  ['Noto Sans Bold', 'https://tiles.openfreemap.org/fonts/Noto%20Sans%20Bold/0-255.pbf'],
  ['Noto Sans Regular', 'https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf'],
];
const RELIEF = 'https://tiles.openfreemap.org/natural_earth/ne2sr/6/14/26.png';
const CENSUS_LAYER = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/82';
const CENSUS_META = `${CENSUS_LAYER}?f=pjson`;
const CENSUS_BEXAR = `${CENSUS_LAYER}/query?where=GEOID%3D%2748029%27&outFields=GEOID%2CBASENAME%2CNAME%2CINTPTLAT%2CINTPTLON&returnGeometry=true&outSR=4326&geometryPrecision=5&f=geojson`;

async function fetchChecked(label, url, accept) {
  return fetchWithCors(label, url, accept, origins);
}

async function json(label, url) {
  const response = await fetchChecked(label, url, 'application/json, application/geo+json');
  try {
    return { response, value: await response.json() };
  } catch (error) {
    throw new Error(`${label}: response was not valid JSON (${error instanceof Error ? error.message : String(error)}).`);
  }
}

function requireFields(vectorLayer, fields) {
  for (const field of fields) {
    if (!(field in (vectorLayer.fields ?? {}))) {
      throw new Error(`OpenFreeMap layer ${vectorLayer.id} is missing required field ${field}.`);
    }
  }
}

const { value: tileJson } = await json('OpenFreeMap TileJSON', TILEJSON);
if (!Array.isArray(tileJson.tiles) || tileJson.tiles.length < 1) throw new Error('OpenFreeMap TileJSON has no vector tile templates.');
if (!Array.isArray(tileJson.vector_layers)) throw new Error('OpenFreeMap TileJSON has no vector_layers contract.');

const requiredLayers = new Map([
  ['transportation', ['class']],
  ['transportation_name', ['class', 'name', 'name_en', 'ref', 'ref_length', 'network', 'route_1_network', 'route_1_ref']],
  ['place', ['class', 'name', 'name_en', 'rank']],
  ['boundary', ['admin_level', 'maritime']],
  ['landcover', ['class']],
  ['landuse', ['class']],
  ['water', ['class']],
  ['waterway', ['class']],
]);
for (const [id, fields] of requiredLayers) {
  const layer = tileJson.vector_layers.find((candidate) => candidate.id === id);
  if (!layer) throw new Error(`OpenFreeMap TileJSON is missing source layer ${id}.`);
  requireFields(layer, fields);
}

const sanAntonioTile = tileJson.tiles[0]
  .replace('{z}', '8')
  .replace('{x}', '57')
  .replace('{y}', '106');
const tileResponse = await fetchChecked('San Antonio vector tile', sanAntonioTile, 'application/x-protobuf, application/vnd.mapbox-vector-tile, */*');
const tileBytes = new Uint8Array(await tileResponse.arrayBuffer());
if (tileBytes.byteLength < 32) throw new Error('San Antonio vector tile returned an implausibly small payload.');

const { value: sprite } = await json('OpenFreeMap sprite index', SPRITE_JSON);
for (const key of [
  'us-interstate_1', 'us-interstate_2', 'us-interstate_3',
  'us-highway_1', 'us-highway_2', 'us-highway_3',
]) {
  if (!sprite[key]) throw new Error(`OpenFreeMap sprite index is missing required shield ${key}.`);
}

for (const [font, url] of GLYPHS) {
  const glyphResponse = await fetchChecked(`${font} glyph PBF`, url, 'application/x-protobuf, */*');
  if ((await glyphResponse.arrayBuffer()).byteLength < 32) throw new Error(`${font} glyph PBF was implausibly small.`);
}

const reliefResponse = await fetchChecked('Natural Earth relief tile', RELIEF, 'image/png, */*');
if ((await reliefResponse.arrayBuffer()).byteLength < 100) throw new Error('Natural Earth relief tile was implausibly small.');

const { value: censusMeta } = await json('Census county layer metadata', CENSUS_META);
if (censusMeta.name !== 'Counties') throw new Error(`Census layer 82 is no longer Counties (got ${String(censusMeta.name)}).`);
if (!String(censusMeta.description ?? '').includes('January 1, 2026 vintage')) throw new Error(`Census Counties vintage changed: ${String(censusMeta.description)}`);
if (censusMeta.geometryType !== 'esriGeometryPolygon') throw new Error(`Census Counties geometry type changed to ${String(censusMeta.geometryType)}.`);
if (!String(censusMeta.supportedQueryFormats ?? '').toLowerCase().includes('geojson')) throw new Error('Census Counties no longer advertises GeoJSON queries.');
const censusFieldNames = new Set((censusMeta.fields ?? []).map((field) => field.name));
for (const field of ['GEOID', 'BASENAME', 'NAME', 'INTPTLAT', 'INTPTLON']) {
  if (!censusFieldNames.has(field)) throw new Error(`Census Counties is missing required field ${field}.`);
}

const { value: bexar } = await json('Census Bexar County GeoJSON query', CENSUS_BEXAR);
if (bexar.type !== 'FeatureCollection' || !Array.isArray(bexar.features) || bexar.features.length !== 1) {
  throw new Error('Census Bexar County query did not return exactly one GeoJSON feature.');
}
if (bexar.features[0]?.properties?.GEOID !== '48029') throw new Error('Census Bexar County query returned the wrong GEOID.');
const bexarLat = Number(bexar.features[0]?.properties?.INTPTLAT);
const bexarLon = Number(bexar.features[0]?.properties?.INTPTLON);
if (!Number.isFinite(bexarLat) || !Number.isFinite(bexarLon)) throw new Error('Census Bexar County query is missing usable interior-point coordinates.');
if (!['Polygon', 'MultiPolygon'].includes(bexar.features[0]?.geometry?.type)) throw new Error('Census Bexar County query returned a non-polygon geometry.');

console.log('RBRWX live basemap/provider preflight: PASS');
console.log(`  OpenFreeMap schema layers: ${tileJson.vector_layers.length}`);
console.log(`  San Antonio z8 tile bytes: ${tileBytes.byteLength}`);
console.log(`  Census county layer: ${censusMeta.description ?? censusMeta.name}`);
