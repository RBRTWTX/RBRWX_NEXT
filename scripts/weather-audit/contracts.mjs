import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = fileURLToPath(new URL('../../', import.meta.url));

function read(root, relative) {
  const full = path.join(root, ...relative.split('/'));
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}

function finding(id, status, priority, category, detail) {
  return { id, status, priority, category, detail };
}

function requireTokens(findings, source, id, category, tokens, detail) {
  if (source === null) {
    findings.push(finding(id, 'FAIL', 'P0', category, `${detail}: source file missing`));
    return;
  }
  const missing = tokens.filter(token => !source.includes(token));
  findings.push(missing.length
    ? finding(id, 'FAIL', 'P0', category, `${detail}: missing ${missing.join(', ')}`)
    : finding(id, 'PASS', '—', category, detail));
}

export function runContractAudit(root = DEFAULT_ROOT, { print = true } = {}) {
  const findings = [];
  const currentObs = read(root, 'src/current-weather/observations.ts');
  const currentController = read(root, 'src/current-weather/controller.ts');
  const imagery = read(root, 'src/current-weather/public-imagery.ts');
  const forecastData = read(root, 'src/forecast-graphics/forecastData.ts');
  const forecastModel = read(root, 'src/forecast-graphics/model.ts');
  const forecastRuntime = read(root, 'src/forecast-graphics/ForecastGraphics.tsx');
  const qpfController = read(root, 'src/qpf/controller.ts');
  const qpfRuntime = read(root, 'src/qpf/Qpf.tsx');
  const qpfModel = read(root, 'src/qpf/model.ts');
  const tauri = read(root, 'src-tauri/tauri.conf.json');

  requireTokens(findings, currentObs, 'OBS-UNITS-QC', 'Current Conditions', [
    "wmoUnit:${unit}", "qualityControl", "degC", "km_h-1", "percent",
  ], 'NWS observation ingestion validates expected units and QC before rendering');

  requireTokens(findings, currentObs, 'OBS-VIEWPORT', 'Current Conditions', [
    'observationStationCap', 'observationSamplePoints', 'selectDistributedStations', 'loadViewport',
  ], 'Current Conditions discovers and distributes stations by visible viewport and zoom');

  if (currentController && /1\s*\/\s*Math\.pow\(Math\.max\(\.015, distance\),\s*1\.7\)/.test(currentController)) {
    findings.push(finding('OBS-IDW-SURFACE', 'WARN', 'P1', 'Current Conditions', 'Colored temperature/humidity/heat-index field is an RBRWX inverse-distance interpolation of station observations, not an official gridded analysis.'));
  } else {
    findings.push(finding('OBS-IDW-SURFACE', 'FAIL', 'P0', 'Current Conditions', 'Current-condition surface method could not be identified; audit assumptions need updating.'));
  }

  requireTokens(findings, imagery, 'RADAR-SITE-DISCOVERY', 'Radar', [
    'fetchRadarSites', 'radarReflectivityLayer', "private activeIds: string[] = ['KEWX']", 'slice(0, 3)',
  ], 'Radar is site-first, defaults to KEWX, dynamically discovers SR_BREF, and enforces the three-site cap');

  requireTokens(findings, imagery, 'RADAR-FRAME-SWAP', 'Radar', [
    "this.map.on('sourcedata', loaded)", 'currentLoadedTimeKey', 'paletteFallbackSites',
  ], 'Radar waits for MapLibre source load before replacing the prior completed frame and tracks palette fallback');

  if (imagery && imagery.includes('await this.loadSite(id, times[times.length - 1]);')) {
    findings.push(finding('RADAR-BAD-FRAME-FALLBACK', 'WARN', 'P0', 'Radar', 'Site radar always attempts the newest advertised frame first and does not probe older advertised frames when GeoServer advertises a corrupt/unrenderable granule.'));
  } else {
    findings.push(finding('RADAR-BAD-FRAME-FALLBACK', 'PASS', '—', 'Radar', 'Site radar does not use the known newest-only frame-loading path.'));
  }

  if (currentController && currentController.includes("freshness(time, this.product === 'radar' ? 15 : 30") && !imagery?.includes('RADAR_CURRENT_MAX_AGE')) {
    findings.push(finding('RADAR-STALE-HARD-CUTOFF', 'WARN', 'P0', 'Radar', 'Radar freshness is reported as status only; stale site imagery is not hard-rejected before display.'));
  } else {
    findings.push(finding('RADAR-STALE-HARD-CUTOFF', 'PASS', '—', 'Radar', 'Radar has a hard stale-frame rejection contract.'));
  }

  if (imagery && imagery.includes('WSR88D_REFLECTIVITY_SWEEP_RPM') && imagery.includes('sweepAngle')) {
    findings.push(finding('RADAR-SWEEP-SYNTHETIC', 'WARN', 'P1', 'Radar', 'Visible radar sweep wedge is an operator visualization, not measured real-time antenna azimuth.'));
  } else {
    findings.push(finding('RADAR-SWEEP-SYNTHETIC', 'PASS', '—', 'Radar', 'No synthetic radar sweep contract detected.'));
  }

  requireTokens(findings, imagery, 'MRMS-BACKUP', 'Radar/MRMS', [
    "conus_base_reflectivity_mosaic", 'setMRMSEnabled', 'setMRMSTimestamp',
  ], 'NOAA nowCOAST MRMS reflectivity is configured as an optional backup mosaic');

  requireTokens(findings, imagery, 'SATELLITE-B14', 'Satellite', [
    "satellite: { url: 'https://nowcoast.noaa.gov/geoserver/satellite/wms'",
    "layer: 'goes_longwave_imagery'",
    'setSatelliteTimestamp',
  ], 'NOAA nowCOAST GOES longwave infrared imagery is configured through the shared satellite service with explicit frame timestamps');

  requireTokens(findings, forecastData, 'FORECAST-NWS-ENDPOINTS', 'Forecast Graphics', [
    'https://api.weather.gov', 'forecastHourly', 'observationStations', '/observations/latest',
  ], 'Forecast Graphics uses NWS point metadata, forecast, hourly forecast, and current observation endpoints');

  if (forecastData && forecastData.includes('const HOME_LAT = 29.4317;') && forecastData.includes('const HOME_LON = -98.8063;')) {
    findings.push(finding('FORECAST-FIXED-LOCATION', 'WARN', 'P1', 'Forecast Graphics', 'Forecast Graphics is hard-wired to one San Antonio-area coordinate instead of an operator/map-selected forecast location.'));
  } else {
    findings.push(finding('FORECAST-FIXED-LOCATION', 'PASS', '—', 'Forecast Graphics', 'Forecast location is not the known hard-coded San Antonio coordinate.'));
  }

  if (forecastData && forecastData.includes('updatedAt: Date.now()')) {
    findings.push(finding('FORECAST-FETCH-TIME', 'WARN', 'P0', 'Forecast Graphics', 'Graphic UPDATED time records local fetch completion instead of NWS generated/update/issue metadata.'));
  } else {
    findings.push(finding('FORECAST-FETCH-TIME', 'PASS', '—', 'Forecast Graphics', 'Forecast update time is not derived from Date.now() fetch completion.'));
  }

  if (forecastData && /function quantity\(raw: unknown\)/.test(forecastData) && !/unitCode/.test(forecastData.slice(forecastData.indexOf('function quantity'), forecastData.indexOf('function cToF')))) {
    findings.push(finding('FORECAST-QUANTITY-UNITS-QC', 'WARN', 'P0', 'Forecast Graphics', 'Forecast observation quantity parser accepts numeric values without validating NWS unitCode or qualityControl.'));
  } else {
    findings.push(finding('FORECAST-QUANTITY-UNITS-QC', 'PASS', '—', 'Forecast Graphics', 'Forecast observation quantity parser validates unit/QC metadata.'));
  }

  if (forecastModel && forecastModel.includes("observation?.description || periodFor(data, 'today')?.shortForecast")) {
    findings.push(finding('FORECAST-OBS-FALLBACK', 'WARN', 'P0', 'Forecast Graphics', 'Missing observed condition can be silently replaced by a forecast condition/icon on the Right Now graphic.'));
  } else {
    findings.push(finding('FORECAST-OBS-FALLBACK', 'PASS', '—', 'Forecast Graphics', 'Observed-condition display does not silently substitute forecast conditions.'));
  }

  if (forecastModel && forecastModel.includes('temperatureUnit') && forecastModel.includes('asDegrees(period.temperature)')) {
    findings.push(finding('FORECAST-TEMP-UNIT-DISPLAY', 'WARN', 'P0', 'Forecast Graphics', 'NWS temperatureUnit is stored but forecast display formats the raw number without converting/labeling by unit.'));
  } else {
    findings.push(finding('FORECAST-TEMP-UNIT-DISPLAY', 'PASS', '—', 'Forecast Graphics', 'Forecast temperature display is unit-aware.'));
  }

  if (forecastModel && forecastModel.includes("return `RAIN ${percent(period.probabilityOfPrecipitation)}`")) {
    findings.push(finding('FORECAST-POP-LABEL', 'WARN', 'P1', 'Forecast Graphics', 'Probability of precipitation is always labeled RAIN, which is incorrect for snow/sleet/freezing precipitation.'));
  } else {
    findings.push(finding('FORECAST-POP-LABEL', 'PASS', '—', 'Forecast Graphics', 'Precipitation-probability labeling is not hard-coded to rain.'));
  }

  if (forecastRuntime && forecastRuntime.includes('10 * 60 * 1000')) {
    findings.push(finding('FORECAST-REFRESH', 'PASS', '—', 'Forecast Graphics', 'Forecast Graphics refreshes live NWS data on a 10-minute cadence while active.'));
  } else {
    findings.push(finding('FORECAST-REFRESH', 'WARN', 'P1', 'Forecast Graphics', 'Forecast refresh cadence could not be verified.'));
  }

  requireTokens(findings, qpfModel, 'QPF-LAYERS', 'WPC QPF', [
    "layerId: 1", "layerId: 2", "layerId: 3", "layerId: 11",
  ], 'WPC QPF scenes use Day 1, Day 2, Day 3, and 168-hour Day 1-7 layers');

  requireTokens(findings, qpfController, 'QPF-SCHEMA', 'WPC QPF', [
    'https://mapservices.weather.noaa.gov/vector/rest/services/precip/wpc_qpf/MapServer',
    "outFields: 'product,valid_time,qpf,units,issue_time,start_time,end_time'", "f: 'geojson'",
  ], 'QPF ingestion requests authoritative WPC GeoJSON fields and validity metadata');

  if (qpfRuntime && !qpfRuntime.includes('setInterval')) {
    findings.push(finding('QPF-AUTO-REFRESH', 'WARN', 'P1', 'WPC QPF', 'QPF does not automatically poll for a newer WPC issuance while a scene remains open; refresh is manual.'));
  } else {
    findings.push(finding('QPF-AUTO-REFRESH', 'PASS', '—', 'WPC QPF', 'QPF automatic refresh is present.'));
  }

  if (qpfRuntime && qpfRuntime.includes('{snapshot.message}') && !qpfRuntime.includes('snapshot.issueTime')) {
    findings.push(finding('QPF-VALIDITY-EXPRESSION', 'WARN', 'P1', 'WPC QPF', 'QPF ingests issue/start/end/valid times but the status surface does not expose them to the operator.'));
  } else {
    findings.push(finding('QPF-VALIDITY-EXPRESSION', 'PASS', '—', 'WPC QPF', 'QPF validity/issuance metadata is exposed to the operator.'));
  }

  requireTokens(findings, tauri, 'TAURI-WEATHER-CSP', 'Network/CSP', [
    'https://api.weather.gov', 'https://nowcoast.noaa.gov', 'https://opengeo.ncep.noaa.gov', 'https://mapservices.weather.noaa.gov',
  ], 'Tauri connect-src allows every currently implemented NOAA/NWS weather provider');

  const roadmap = [
    'WPC fronts/surface analysis',
    'NWS alerts + SPC outlooks/watches/mesoscale discussions',
    'NHC tropical/hurricane track, cone, wind radii, probabilities and surge',
    'WPC snow/ice probabilities and winter impact products',
    'GOES GLM lightning',
    'RTMA/URMA analyzed current fields',
    'Expanded MRMS QPE/precipitation type/hail/rotation diagnostics',
    'Full GOES visible/water-vapor/derived products',
    'Dual-pol/velocity Level II/III radar products',
    'HRRR/RAP/NAM/GFS/GEFS/NBM/ECMWF/HAFS model guidance',
    'Upper-air, soundings, hydrology/flood, fire, marine/coastal and climatology products',
  ];

  if (print) {
    console.log('RBRWX NEXT WEATHER DATA CONTRACT AUDIT');
    console.log('Implemented pipeline checks:');
    for (const item of findings) console.log(`${item.status.padEnd(4)} ${item.priority.padEnd(3)} ${item.id.padEnd(29)} ${item.detail}`);
    const counts = Object.groupBy(findings, item => item.status);
    console.log(`\nSummary: PASS ${(counts.PASS ?? []).length} | WARN ${(counts.WARN ?? []).length} | FAIL ${(counts.FAIL ?? []).length}`);
    console.log('\nBaron-parity roadmap (not implemented, therefore not current-pipeline failures):');
    for (const item of roadmap) console.log(`ROADMAP  ${item}`);
  }

  return { findings, roadmap };
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  const { findings } = runContractAudit(DEFAULT_ROOT, { print: true });
  if (findings.some(item => item.status === 'FAIL')) process.exitCode = 1;
}
