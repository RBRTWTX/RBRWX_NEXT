import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runContractAudit } from './contracts.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const ORIGIN = 'http://tauri.localhost';
const NWS_POINT = '29.4317,-98.8063';
const KEWX_SITE_FEED = 'https://opengeo.ncep.noaa.gov/geoserver/nws/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=nws%3Aradar_sites&outputFormat=application%2Fjson';
const KEWX_ENDPOINT = 'https://opengeo.ncep.noaa.gov/geoserver/kewx/ows';
const RADAR_CURRENT_MAX_AGE_MS = 15 * 60 * 1000;
const NOWCOAST_RADAR_MAX_AGE_MS = 20 * 60 * 1000;
const SATELLITE_MAX_AGE_MS = 30 * 60 * 1000;
const results = [];

function push(id, status, detail) { results.push({ id, status, detail }); }
function lastUseful(text) { return String(text ?? '').split(/\r?\n/).map(x => x.trim()).filter(Boolean).at(-1) ?? ''; }

export function summarizeProcessFailure(text, exitStatus = null) {
  const raw = String(text ?? '');
  const assertion = /AssertionError(?:\s*\[[^\]]+\])?:\s*([^\r\n]+)/.exec(raw)?.[1]?.trim();
  if (assertion) return assertion;
  const service = /<ServiceException[^>]*>([\s\S]*?)<\/ServiceException>/i.exec(raw)?.[1]
    ?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (service) return service.slice(0, 500);
  const explicit = raw.split(/\r?\n/).map(line => line.trim()).find(line => /^Error:\s+/.test(line));
  if (explicit) return explicit.replace(/^Error:\s+/, '');
  const useful = raw.split(/\r?\n/).map(line => line.trim()).filter(line => line && !/^Node\.js v\d+/i.test(line) && !/^at\s/.test(line) && line !== '^');
  return useful.at(-1) ?? (exitStatus === null ? 'provider process failed' : `exit ${exitStatus}`);
}

function corsOkay(response) {
  const value = response.headers.get('access-control-allow-origin');
  return value === '*' || value === ORIGIN;
}

async function request(url, { accept = '*/*', timeout = 25000 } = {}) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeout),
    cache: 'no-store',
    credentials: 'omit',
    headers: { Accept: accept, Origin: ORIGIN, 'User-Agent': 'RBRWX NEXT weather audit (https://github.com/RBRTWTX/RBRWX_NEXT)' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  if (!corsOkay(response)) throw new Error(`CORS does not permit ${ORIGIN} (${response.headers.get('access-control-allow-origin') ?? 'missing header'})`);
  return response;
}

async function json(url) { return request(url, { accept: 'application/geo+json, application/json;q=0.9' }).then(r => r.json()); }
async function text(url) { return request(url, { accept: 'application/xml,text/xml;q=0.9,*/*;q=0.1' }).then(r => r.text()); }

function parseIso(value) {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTimeDimension(value) {
  const out = [];
  for (const raw of String(value ?? '').split(',')) {
    const item = raw.trim();
    if (!item) continue;
    if (!item.includes('/')) {
      const t = parseIso(item); if (t !== null) out.push(t); continue;
    }
    const [start, end, period] = item.split('/');
    const a = parseIso(start), b = parseIso(end);
    const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(period ?? '');
    if (a === null || b === null || !m) continue;
    const step = ((Number(m[1] ?? 0) * 3600) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0)) * 1000;
    if (!step) continue;
    const first = Math.max(a, b - step * 199);
    for (let t = first; t <= b && out.length < 200; t += step) out.push(t);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function layerXml(xml, layer) {
  const escaped = escapeRegex(layer);
  const namePattern = new RegExp(`<[^>]*Name[^>]*>\\s*(?:[^<:]+:)?${escaped}\\s*<\\/[^>]*Name>`, 'i');
  const name = namePattern.exec(xml);
  if (!name) throw new Error(`layer ${layer} not found in capabilities`);
  const start = xml.lastIndexOf('<Layer', name.index);
  if (start < 0) throw new Error(`layer ${layer} is not contained in a WMS Layer element`);
  const tag = /<\/?Layer\b[^>]*>/gi;
  tag.lastIndex = start;
  let depth = 0;
  for (let match = tag.exec(xml); match; match = tag.exec(xml)) {
    depth += /^<\/Layer/i.test(match[0]) ? -1 : 1;
    if (depth === 0) return xml.slice(start, tag.lastIndex);
  }
  throw new Error(`layer ${layer} Layer element is not balanced`);
}

function wmsLayerTimes(xml, layer) {
  const block = layerXml(xml, layer);
  const timeMatch = /<(?:\w+:)?(?:Dimension|Extent)\b[^>]*\bname=["']time["'][^>]*>([\s\S]*?)<\/(?:\w+:)?(?:Dimension|Extent)>/i.exec(block);
  const times = parseTimeDimension(timeMatch?.[1]);
  if (!times.length) throw new Error(`layer ${layer} has no advertised timestamps`);
  return times;
}

function mercX(lng) { return lng * 20037508.342789244 / 180; }
function mercY(lat) { return Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 6378137; }

function durationLabel(ms) {
  const value = Math.max(0, Math.round(ms / 60000));
  if (value < 60) return `${value}m`;
  const hours = Math.floor(value / 60), minutes = value % 60;
  return `${hours}h${String(minutes).padStart(2, '0')}m`;
}

function serviceExceptionSummary(body) {
  const granule = String(body).match(/(?:K|P|T)[A-Z0-9]{3}_L3_SR_BREF_\d+\.tif/i)?.[0] ?? null;
  const stripped = String(body).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const lead = stripped.includes('Error rendering coverage on the fast path')
    ? 'GeoServer could not render advertised radar granule'
    : stripped.slice(0, 220) || 'WMS service exception';
  return granule ? `${lead} (${granule})` : lead;
}

export function assessRadarFrames({ times, frames, now = Date.now(), maxAgeMs = RADAR_CURRENT_MAX_AGE_MS }) {
  const ordered = [...times].sort((a, b) => b - a);
  if (!ordered.length) return { status: 'FAIL', detail: 'KEWX advertises no radar timestamps' };
  const latest = ordered[0];
  const byTime = new Map(frames.map(frame => [frame.time, frame]));
  const renderable = ordered.map(time => byTime.get(time)).filter(frame => frame?.ok);
  const latestFrame = byTime.get(latest);
  const latestAge = now - latest;
  const newestRenderable = renderable[0] ?? null;
  const currentRenderable = renderable.find(frame => now - frame.time <= maxAgeMs) ?? null;
  const base = `${renderable.length}/${ordered.length} advertised frames rendered`;

  if (!latestFrame?.ok) {
    const currentText = currentRenderable ? `a current older frame exists at ${new Date(currentRenderable.time).toISOString()}` : 'no renderable frame is within the current-radar age limit';
    return { status: 'FAIL', detail: `latest advertised KEWX frame failed · ${base} · ${currentText} · ${latestFrame?.reason ?? 'service exception'}` };
  }
  if (latestAge > maxAgeMs) {
    return { status: 'FAIL', detail: `latest renderable KEWX frame is stale (${durationLabel(latestAge)} old at ${new Date(latest).toISOString()}) · ${base}` };
  }
  return { status: 'PASS', detail: `latest KEWX frame current (${durationLabel(latestAge)} old) · ${base} · PNG ${latestFrame.bytes ?? '?'} bytes`, frame: latest };
}

async function probeWmsImage(label, endpoint, layer, maxAgeMs) {
  const capabilities = await text(`${endpoint}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities`);
  const times = wmsLayerTimes(capabilities, layer);
  const latest = times.at(-1);
  const age = Date.now() - latest;
  if (age > maxAgeMs) throw new Error(`${label} latest advertised frame is stale (${durationLabel(age)} old at ${new Date(latest).toISOString()})`);
  const cx = mercX(-98.4936), cy = mercY(29.4241), span = 350000;
  const url = new URL(endpoint);
  const params = {
    SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetMap', LAYERS: layer, STYLES: '', FORMAT: 'image/png', TRANSPARENT: 'TRUE',
    SRS: 'EPSG:3857', BBOX: [cx - span, cy - span, cx + span, cy + span].join(','), WIDTH: '256', HEIGHT: '256', TIME: new Date(latest).toISOString(),
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await request(url.href, { accept: 'image/png,*/*;q=0.1' });
  const type = response.headers.get('content-type') ?? '';
  if (!/^image\/png\b/i.test(type)) throw new Error(`expected image/png, got ${type || 'missing content-type'} · ${serviceExceptionSummary(await response.text())}`);
  const size = (await response.arrayBuffer()).byteLength;
  if (size < 100) throw new Error(`PNG response too small (${size} bytes)`);
  return `${label}: latest advertised ${new Date(latest).toISOString()} · ${durationLabel(age)} old · PNG ${size} bytes`;
}

function runExistingCapture(script) {
  const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8', shell: false, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.status !== 0) return { status: 'FAIL', detail: summarizeProcessFailure(combined, result.status), combined };
  return { status: /fallback/i.test(combined) ? 'WARN' : 'PASS', detail: lastUseful(combined) || 'provider probe passed', combined };
}

function runExisting(id, script) {
  const result = runExistingCapture(script);
  push(id, result.status, result.detail);
}

function radarReflectivityLayer(xml, siteId) {
  const names = [...xml.matchAll(/<(?:\w+:)?Name\b[^>]*>\s*([^<]+?)\s*<\/(?:\w+:)?Name>/gi)].map(match => match[1].trim());
  const local = name => name.split(':').at(-1)?.toLowerCase() ?? name.toLowerCase();
  const site = siteId.toLowerCase();
  return names.find(name => local(name) === `${site}_sr_bref`)
    ?? names.find(name => local(name) === 'sr_bref')
    ?? names.find(name => local(name).endsWith('_sr_bref'))
    ?? null;
}

async function fetchRadarFrame(layer, time) {
  const center = { lng: -98.028611, lat: 29.704056 }, span = 300000;
  const cx = mercX(center.lng), cy = mercY(center.lat);
  const url = new URL(KEWX_ENDPOINT);
  const params = {
    SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetMap', LAYERS: layer, STYLES: '', FORMAT: 'image/png', TRANSPARENT: 'TRUE',
    SRS: 'EPSG:3857', BBOX: [cx - span, cy - span, cx + span, cy + span].join(','), WIDTH: '256', HEIGHT: '256', TIME: new Date(time).toISOString(),
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await request(url.href, { accept: 'image/png,*/*;q=0.1' });
  const type = response.headers.get('content-type') ?? '';
  if (/^image\/png\b/i.test(type)) {
    const bytes = (await response.arrayBuffer()).byteLength;
    return bytes > 100 ? { time, ok: true, bytes } : { time, ok: false, reason: `PNG too small (${bytes} bytes)` };
  }
  return { time, ok: false, reason: serviceExceptionSummary(await response.text()) };
}

async function probeKewxRadar() {
  const siteJson = await json(KEWX_SITE_FEED);
  const site = Array.isArray(siteJson?.features) ? siteJson.features.find(feature => String(feature?.properties?.rda_id ?? '').toUpperCase() === 'KEWX') : null;
  if (!site) throw new Error('NWS radar-site catalog did not include KEWX');
  const coordinates = site.geometry?.coordinates;
  if (!Array.isArray(coordinates) || !Number.isFinite(Number(coordinates[0])) || !Number.isFinite(Number(coordinates[1]))) throw new Error('KEWX radar-site coordinates are invalid');

  const capabilities = await text(`${KEWX_ENDPOINT}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities`);
  const layer = radarReflectivityLayer(capabilities, 'KEWX');
  if (!layer) throw new Error('KEWX capabilities do not advertise site-qualified SR_BREF');
  const times = wmsLayerTimes(capabilities, layer).slice(-12).sort((a, b) => b - a);
  const frames = [];
  for (let offset = 0; offset < times.length; offset += 3) {
    const batch = await Promise.all(times.slice(offset, offset + 3).map(time => fetchRadarFrame(layer, time).catch(error => ({ time, ok: false, reason: error instanceof Error ? error.message : String(error) }))));
    frames.push(...batch);
  }
  const assessment = assessRadarFrames({ times, frames });
  if (assessment.status !== 'PASS') return assessment;

  const full = runExistingCapture('scripts/current-weather/provider-radar.mjs');
  if (full.status === 'FAIL') return full;
  return { status: full.status, detail: `${assessment.detail} · ${full.detail}` };
}

async function probeForecastGraphics() {
  const point = await json(`https://api.weather.gov/points/${NWS_POINT}`);
  const p = point?.properties ?? {};
  for (const key of ['forecast', 'forecastHourly', 'observationStations']) {
    if (typeof p[key] !== 'string' || !p[key].startsWith('https://api.weather.gov/')) throw new Error(`NWS point metadata missing ${key}`);
  }
  if (typeof p.timeZone !== 'string' || !p.timeZone) throw new Error('NWS point metadata missing timeZone');

  const [forecast, hourly, stations] = await Promise.all([json(p.forecast), json(p.forecastHourly), json(p.observationStations)]);
  const periods = forecast?.properties?.periods;
  const hours = hourly?.properties?.periods;
  if (!Array.isArray(periods) || periods.length < 2) throw new Error('forecast periods missing');
  if (!Array.isArray(hours) || hours.length < 6) throw new Error('hourly periods missing');
  const first = periods[0];
  if (!Number.isFinite(first?.temperature) || !['F', 'C'].includes(String(first?.temperatureUnit))) throw new Error('forecast temperature/unit contract invalid');
  if (parseIso(first?.startTime) === null || parseIso(first?.endTime) === null) throw new Error('forecast validity timestamps invalid');
  const stationUrl = stations?.features?.find(feature => typeof feature?.id === 'string')?.id;
  if (!stationUrl) throw new Error('observation station collection is empty');
  const observation = await json(`${stationUrl}/observations/latest`);
  if (parseIso(observation?.properties?.timestamp) === null) throw new Error('latest station observation has no valid timestamp');

  const updateTime = forecast?.properties?.updateTime ?? forecast?.properties?.generatedAt ?? forecast?.properties?.updated;
  const update = parseIso(updateTime);
  return {
    detail: `NWS point/forecast/hourly/observation chain PASS · ${periods.length} forecast periods · ${hours.length} hourly periods · ${p.timeZone}`,
    metadataWarning: update === null ? 'NWS forecast response did not expose a parseable product update/generation timestamp in the expected fields' : null,
  };
}

export async function main() {
  results.length = 0;
  const contracts = runContractAudit(root, { print: false });
  if (contracts.findings.some(item => item.status === 'FAIL')) push('STATIC-CONTRACTS', 'FAIL', 'Deterministic weather contract audit contains FAIL findings');
  else push('STATIC-CONTRACTS', contracts.findings.some(item => item.status === 'WARN') ? 'WARN' : 'PASS', `${contracts.findings.filter(x => x.status === 'PASS').length} PASS, ${contracts.findings.filter(x => x.status === 'WARN').length} known design warnings`);

  const config = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  const csp = String(config.app?.security?.csp ?? '');
  const hosts = ['https://api.weather.gov', 'https://nowcoast.noaa.gov', 'https://opengeo.ncep.noaa.gov', 'https://mapservices.weather.noaa.gov'];
  const missing = hosts.filter(host => !csp.includes(host));
  push('TAURI-CSP', missing.length ? 'FAIL' : 'PASS', missing.length ? `missing ${missing.join(', ')}` : 'all implemented NOAA/NWS weather hosts allowed');

  runExisting('NWS-OBSERVATIONS', 'scripts/current-weather/provider.mjs');
  try {
    const radar = await probeKewxRadar();
    push('WSR88D-KEWX', radar.status, radar.detail);
  } catch (error) { push('WSR88D-KEWX', 'FAIL', error instanceof Error ? error.message : String(error)); }
  runExisting('WPC-QPF', 'scripts/qpf/verify-provider.mjs');

  try {
    const forecast = await probeForecastGraphics();
    push('NWS-FORECAST-GRAPHICS', forecast.metadataWarning ? 'WARN' : 'PASS', `${forecast.detail}${forecast.metadataWarning ? ` · ${forecast.metadataWarning}` : ''}`);
  } catch (error) { push('NWS-FORECAST-GRAPHICS', 'FAIL', error instanceof Error ? error.message : String(error)); }

  try { push('NOWCOAST-MRMS', 'PASS', await probeWmsImage('MRMS reflectivity', 'https://nowcoast.noaa.gov/geoserver/observations/weather_radar/wms', 'conus_base_reflectivity_mosaic', NOWCOAST_RADAR_MAX_AGE_MS)); }
  catch (error) { push('NOWCOAST-MRMS', 'FAIL', error instanceof Error ? error.message : String(error)); }

  try { push('NOWCOAST-SATELLITE', 'PASS', await probeWmsImage('GOES longwave imagery', 'https://nowcoast.noaa.gov/geoserver/satellite/wms', 'goes_longwave_imagery', SATELLITE_MAX_AGE_MS)); }
  catch (error) { push('NOWCOAST-SATELLITE', 'FAIL', error instanceof Error ? error.message : String(error)); }

  console.log('\nRBRWX NEXT LIVE WEATHER DATA AUDIT');
  console.log('STATUS  PROVIDER / PIPELINE          DETAIL');
  console.log('------  ---------------------------  ------------------------------------------------------------');
  for (const item of results) console.log(`${item.status.padEnd(6)}  ${item.id.padEnd(27)}  ${item.detail}`);
  const pass = results.filter(x => x.status === 'PASS').length;
  const warn = results.filter(x => x.status === 'WARN').length;
  const fail = results.filter(x => x.status === 'FAIL').length;
  console.log(`\nSummary: PASS ${pass} | WARN ${warn} | FAIL ${fail}`);
  console.log('WARN means the provider/path responded but a known correctness or fallback issue remains; FAIL means the implemented live pipeline did not meet its provider contract.');
  if (fail) process.exitCode = 1;
  return { results, pass, warn, fail };
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url)) : false;
if (invoked) await main();
