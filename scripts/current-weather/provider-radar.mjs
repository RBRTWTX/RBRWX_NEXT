import assert from 'node:assert/strict';
import fs from 'node:fs';

const ORIGIN = 'http://tauri.localhost';
const SITE_FEED = 'https://opengeo.ncep.noaa.gov/geoserver/nws/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=nws%3Aradar_sites&outputFormat=application%2Fjson';
const SITE_ID = 'KEWX';
const ENDPOINT = `https://opengeo.ncep.noaa.gov/geoserver/${SITE_ID.toLowerCase()}/ows`;

function assertCors(response, label) {
  const cors = response.headers.get('access-control-allow-origin');
  assert.ok(cors === '*' || cors === ORIGIN, `${label}: CORS does not permit the Windows/Tauri origin (${cors ?? 'missing header'})`);
}

async function checkedFetch(url, label, accept) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(25000),
    credentials: 'omit',
    headers: {
      Accept: accept,
      Origin: ORIGIN,
      'User-Agent': 'RBRWX NEXT provider validation (https://github.com/RBRTWTX/RBRWX_NEXT)',
    },
  });
  assert.equal(response.ok, true, `${label}: HTTP ${response.status}`);
  assertCors(response, label);
  return response;
}

function mercX(lng) { return lng * 20037508.342789244 / 180; }
function mercY(lat) { return Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 6378137; }
function hex(n) { return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'); }
function colorHex(rgba) { return `#${hex(rgba[0])}${hex(rgba[1])}${hex(rgba[2])}`; }

function parsePalette(text) {
  const stops = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split(';')[0].trim();
    const match = /^(color4|color):\s*(.+)$/i.exec(line);
    if (!match) continue;
    const values = match[2].trim().split(/\s+/).map(Number);
    const is4 = match[1].toLowerCase() === 'color4', width = is4 ? 4 : 3;
    if (values.length < 1 + width || values.some(value => !Number.isFinite(value))) continue;
    const first = values.slice(1, 1 + width), second = values.slice(1 + width, 1 + width * 2);
    const rgba = parts => [parts[0], parts[1], parts[2], is4 ? parts[3] : 255];
    stops.push({ value: values[0], start: rgba(first), end: second.length === width ? rgba(second) : undefined });
  }
  return stops.sort((a, b) => a.value - b.value);
}

function paletteSld(text, layer = 'SR_BREF') {
  const stops = parsePalette(text), entries = [];
  assert.ok(stops.length >= 10, 'RadarScope palette did not parse into the expected reflectivity stops');
  for (let i = 0; i < stops.length; i++) {
    const current = stops[i];
    entries.push(`<sld:ColorMapEntry color="${colorHex(current.start)}" quantity="${current.value}" opacity="${(current.start[3] / 255).toFixed(4)}"/>`);
    const next = stops[i + 1];
    if (next) {
      const end = current.end ?? next.start;
      entries.push(`<sld:ColorMapEntry color="${colorHex(end)}" quantity="${(next.value - .001).toFixed(3)}" opacity="${(end[3] / 255).toFixed(4)}"/>`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?><sld:StyledLayerDescriptor version="1.0.0" xmlns:sld="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc"><sld:NamedLayer><sld:Name>${layer}</sld:Name><sld:UserStyle><sld:FeatureTypeStyle><sld:Rule><sld:RasterSymbolizer><sld:ColorMap type="ramp">${entries.join('')}</sld:ColorMap></sld:RasterSymbolizer></sld:Rule></sld:FeatureTypeStyle></sld:UserStyle></sld:NamedLayer></sld:StyledLayerDescriptor>`;
}


function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function radarReflectivityLayer(xml, siteId) {
  const names = [...xml.matchAll(/<(?:\w+:)?Name\b[^>]*>\s*([^<]+?)\s*<\/(?:\w+:)?Name>/gi)].map(match => match[1].trim());
  const local = name => name.split(':').at(-1).toLowerCase();
  const site = siteId.toLowerCase();
  return names.find(name => local(name) === `${site}_sr_bref`)
    ?? names.find(name => local(name) === 'sr_bref')
    ?? names.find(name => local(name).endsWith('_sr_bref'))
    ?? null;
}

function layerXml(xml, layer) {
  const escaped = escapeRegex(layer);
  const namePattern = new RegExp(`<[^>]*Name[^>]*>\\s*${escaped}\\s*<\\/[^>]*Name>`, 'i');
  const name = namePattern.exec(xml);
  assert.ok(name, `Capabilities do not advertise ${layer}`);
  const start = xml.lastIndexOf('<Layer', name.index);
  assert.ok(start >= 0, `${layer} is not contained in a WMS Layer element`);
  const tag = /<\/?Layer\b[^>]*>/gi;
  tag.lastIndex = start;
  let depth = 0;
  for (let match = tag.exec(xml); match; match = tag.exec(xml)) {
    const closing = /^<\/Layer/i.test(match[0]);
    depth += closing ? -1 : 1;
    if (depth === 0) return xml.slice(start, tag.lastIndex);
  }
  throw new Error(`${layer} Layer element is not balanced in capabilities XML`);
}

function latestLayerTime(xml, layer) {
  const block = layerXml(xml, layer);
  const dimension = /<(?:\w+:)?(?:Dimension|Extent)\b[^>]*\bname=["']time["'][^>]*>([\s\S]*?)<\/(?:\w+:)?(?:Dimension|Extent)>/i.exec(block);
  assert.ok(dimension, `${layer} does not advertise its own time dimension`);
  const candidates = [];
  for (const token of dimension[1].split(',')) {
    const text = token.trim();
    if (!text) continue;
    if (text.includes('/')) {
      const parts = text.split('/');
      const end = parts[1];
      if (Number.isFinite(Date.parse(end))) candidates.push(end);
      continue;
    }
    if (Number.isFinite(Date.parse(text))) candidates.push(text);
  }
  assert.ok(candidates.length, `${layer} time dimension contains no parseable timestamps`);
  return candidates.sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1);
}

function imageUrl({ layer, time, sld }) {
  const center = { lng: -98.028611, lat: 29.704056 }, span = 300000;
  const cx = mercX(center.lng), cy = mercY(center.lat);
  const url = new URL(ENDPOINT);
  const params = {
    SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetMap', LAYERS: layer, STYLES: '', FORMAT: 'image/png', TRANSPARENT: 'TRUE',
    EXCEPTIONS: 'application/vnd.ogc.se_xml', SRS: 'EPSG:3857', BBOX: [cx - span, cy - span, cx + span, cy + span].join(','), WIDTH: '256', HEIGHT: '256',
  };
  if (time) params.TIME = time;
  if (sld) params.SLD_BODY = sld;
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.href;
}

const siteResponse = await checkedFetch(SITE_FEED, 'NWS radar-site WFS', 'application/json');
const siteJson = await siteResponse.json();
const sites = Array.isArray(siteJson.features) ? siteJson.features : [];
const kewx = sites.find(feature => String(feature?.properties?.rda_id ?? '').toUpperCase() === SITE_ID);
assert.ok(kewx, 'NWS radar-site WFS did not contain KEWX');
assert.ok(Array.isArray(kewx.geometry?.coordinates) && Number.isFinite(Number(kewx.geometry.coordinates[0])) && Number.isFinite(Number(kewx.geometry.coordinates[1])), 'KEWX coordinates are missing from the NWS radar-site WFS');

const capabilitiesUrl = `${ENDPOINT}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities`;
const capabilitiesResponse = await checkedFetch(capabilitiesUrl, 'KEWX WMS capabilities', 'application/xml,text/xml;q=0.9,*/*;q=0.1');
const capabilities = await capabilitiesResponse.text();
const layer = radarReflectivityLayer(capabilities, SITE_ID);
assert.ok(layer, 'KEWX capabilities do not advertise a site-qualified Super Resolution Base Reflectivity layer');
const latestTime = latestLayerTime(capabilities, layer);

const unstyled = await checkedFetch(imageUrl({ layer, time: latestTime }), `KEWX ${layer} image`, 'image/png,*/*;q=0.1');
assert.match(unstyled.headers.get('content-type') ?? '', /^image\/png\b/i, `KEWX ${layer} did not return PNG imagery`);
assert.ok((await unstyled.arrayBuffer()).byteLength > 100, `KEWX ${layer} returned an unexpectedly small image`);

const paletteText = fs.readFileSync(new URL('../../src/current-weather/RadarScope1.pal', import.meta.url), 'utf8');
const sld = paletteSld(paletteText, layer);
assert.ok(sld.includes('color="#c7b000" quantity="42.499"'), 'Live provider probe generated the wrong RadarScope two-RGB gradient');
let palette = 'NWS service style fallback';
try {
  const styled = await checkedFetch(imageUrl({ layer, time: latestTime, sld }), `KEWX ${layer} RadarScope SLD image`, 'image/png,*/*;q=0.1');
  assert.match(styled.headers.get('content-type') ?? '', /^image\/png\b/i, `KEWX rejected the RadarScope SLD request for ${layer}`);
  assert.ok((await styled.arrayBuffer()).byteLength > 100, `KEWX RadarScope SLD returned an unexpectedly small image for ${layer}`);
  palette = 'RadarScope SLD accepted';
} catch (error) {
  console.warn(`RadarScope SLD diagnostic: ${error instanceof Error ? error.message : String(error)}. Runtime fallback remains available.`);
}

console.log(`Live NWS radar provider PASS: radar-site WFS, discovered KEWX layer ${layer}, its own time dimension, PNG rendering and Windows/Tauri CORS (${palette})${latestTime ? ` (latest advertised ${latestTime})` : ''}.`);
