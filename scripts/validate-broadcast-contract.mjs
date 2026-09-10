import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const contract = JSON.parse(await readFile(new URL('src/map/broadcastMapContract.json', root), 'utf8'));
const style = JSON.parse(await readFile(new URL('src/map/broadcastMapStyle.json', root), 'utf8'));
const broadcastMapSource = await readFile(new URL('src/map/BroadcastMap.tsx', root), 'utf8');
const appSource = await readFile(new URL('src/app/App.tsx', root), 'utf8');
const routeBadgeSource = await readFile(new URL('src/map/routeBadges.ts', root), 'utf8');
const tauriConfig = JSON.parse(await readFile(new URL('src-tauri/tauri.conf.json', root), 'utf8'));

function fail(message) {
  throw new Error(`Broadcast map contract: ${message}`);
}


function layerById(id) {
  const layer = style.layers.find((candidate) => candidate.id === id);
  if (!layer) fail(`style is missing layer ${id}.`);
  return layer;
}

function unique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) fail(`${label} contains duplicate value ${value}.`);
    seen.add(value);
  }
}

if (contract.schemaVersion !== 1) fail(`unexpected schemaVersion ${contract.schemaVersion}.`);
if (style.version !== 8) fail(`MapLibre style version must be 8, got ${style.version}.`);
if (style.metadata?.['rbrwx:schema-version'] !== contract.schemaVersion) fail('style schema metadata does not match contract.');
if (style.metadata?.['rbrwx:weather-insert-before'] !== contract.weatherInsertBefore) fail('style weather insertion metadata does not match contract.');


if (!contract.images || contract.images.texasRouteBadge !== 'rbrwx-tx-route-badge') {
  fail('Texas route badge image contract is missing or drifted.');
}

const sourceIds = Object.values(contract.sources);
unique(sourceIds, 'source IDs');
for (const sourceId of sourceIds) {
  if (!(sourceId in style.sources)) fail(`style is missing required source ${sourceId}.`);
}

if (style.sources[contract.sources.basemap]?.url !== contract.providers.basemapTileJson) fail('basemap TileJSON URL drifted from contract.');
if (style.glyphs !== contract.providers.glyphs) fail('glyph URL drifted from contract.');
if (style.sprite !== contract.providers.sprite) fail('sprite URL drifted from contract.');
if (style.sources[contract.sources.relief]?.tiles?.[0] !== contract.providers.reliefTiles) fail('relief tile URL drifted from contract.');
if (style.sources[contract.sources.satellite]?.type !== 'raster') fail('satellite basemap source must be raster.');
if (style.sources[contract.sources.satellite]?.tiles?.[0] !== contract.providers.satelliteTiles) fail('satellite tile URL drifted from contract.');
if (style.sources[contract.sources.satellite]?.tileSize !== 256) fail('satellite tile size must remain 256.');
if (style.sources[contract.sources.satellite]?.maxzoom !== 16) fail('satellite source maxzoom must remain aligned to the advertised USGS imagery scale.');
if (!String(style.sources[contract.sources.satellite]?.attribution ?? '').includes('USGS')) fail('satellite imagery attribution is missing USGS.');

if (contract.sources.countyBoundaries === contract.sources.countyLabels) fail('county boundary and label sources must remain separate.');
if (style.sources[contract.sources.countyBoundaries]?.type !== 'geojson') fail('county boundary source must be GeoJSON.');
if (style.sources[contract.sources.countyLabels]?.type !== 'geojson') fail('county label source must be GeoJSON.');
if (style.sources[contract.sources.weatherSlot]?.type !== 'geojson') fail('weather insertion source must be GeoJSON.');

const styleLayerIds = style.layers.map((layer) => layer.id);
const contractLayerIds = Object.values(contract.layers);
unique(styleLayerIds, 'style layer IDs');
unique(contractLayerIds, 'contract layer IDs');

for (const layerId of contractLayerIds) {
  if (!styleLayerIds.includes(layerId)) fail(`style is missing contract layer ${layerId}.`);
}
for (const layerId of styleLayerIds) {
  if (!contractLayerIds.includes(layerId)) fail(`style contains unowned layer ${layerId}.`);
}

if (layerById(contract.layers.countyBoundary).source !== contract.sources.countyBoundaries) fail('county boundary layer is not bound to the authoritative county-boundary source.');
if (layerById(contract.layers.countyLabel).source !== contract.sources.countyLabels) fail('county label layer is not bound to the county interior-point source.');
if (JSON.stringify(layerById(contract.layers.countyLabel).filter) !== JSON.stringify(['==', ['geometry-type'], 'Point'])) fail('county labels must render only Census interior-point features.');
if (layerById(contract.layers.weatherAnchor).source !== contract.sources.weatherSlot) fail('weather anchor is not bound to the weather insertion source.');

const satelliteLayer = layerById(contract.layers.satellite);
if (satelliteLayer.type !== 'raster') fail('satellite basemap layer must be raster.');
if (satelliteLayer.source !== contract.sources.satellite) fail('satellite basemap layer is not bound to the satellite source.');
if (satelliteLayer.layout?.visibility !== 'none') fail('satellite basemap must default OFF so the accepted broadcast map remains the startup mode.');
if (satelliteLayer.paint?.['raster-opacity'] !== 1) fail('satellite basemap must preserve source imagery at full opacity.');
if (satelliteLayer.paint?.['raster-fade-duration'] !== 0) fail('satellite basemap must not crossfade stale imagery tiles.');

for (const id of [
  contract.layers.roadMinorCasing,
  contract.layers.roadMinor,
  contract.layers.roadSecondaryCasing,
  contract.layers.roadSecondary,
  contract.layers.roadPrimaryCasing,
  contract.layers.roadPrimary,
  contract.layers.roadTrunkCasing,
  contract.layers.roadTrunk,
  contract.layers.roadMotorwayCasing,
  contract.layers.roadMotorway,
  contract.layers.roadNameMajor,
  contract.layers.roadNameLocal,
  contract.layers.interstateShield,
  contract.layers.usHighwayShield,
  contract.layers.texasRouteRef,
  contract.layers.cityMinor,
  contract.layers.cityTown,
  contract.layers.cityRegional,
  contract.layers.cityMajor,
  contract.layers.stateBoundaryCasing,
  contract.layers.stateBoundary,
  contract.layers.stateLabel,
]) {
  if (layerById(id).source !== contract.sources.basemap) fail(`${id} drifted away from the normalized basemap source.`);
}

const shieldExpectations = [
  [contract.layers.interstateShield, 'us-interstate', 3],
  [contract.layers.usHighwayShield, 'us-highway', 3],
];
for (const [id, network, maxLength] of shieldExpectations) {
  const text = JSON.stringify(layerById(id));
  if (!text.includes(network)) fail(`${id} is missing network ${network}.`);
  if (!text.includes('ref_length')) fail(`${id} is missing ref_length sprite sizing.`);
  if (!text.includes(JSON.stringify(['<=', ['get', 'ref_length'], maxLength]))) fail(`${id} allows unsupported shield lengths.`);
}

const texasRouteLayer = layerById(contract.layers.texasRouteRef);
const texasRouteText = JSON.stringify(texasRouteLayer);
for (const field of ['route_1_network', 'route_1_ref']) {
  if (!texasRouteText.includes(JSON.stringify(['get', field])) && !texasRouteText.includes(JSON.stringify(['has', field]))) {
    fail(`${contract.layers.texasRouteRef} does not consume preserved ${field} route metadata.`);
  }
}
for (const network of ['US:TX', 'US:TX:FM', 'US:TX:RM', 'US:TX:Loop', 'US:TX:Spur']) {
  if (!texasRouteText.includes(network)) fail(`${contract.layers.texasRouteRef} is missing Texas route family ${network}.`);
}
if (texasRouteText.includes('us-state_')) fail(`${contract.layers.texasRouteRef} must not fake Texas routes with the generic us-state sprite.`);
if (!texasRouteText.includes(contract.images.texasRouteBadge)) fail(`${contract.layers.texasRouteRef} is not using the RBRWX-owned Texas guide-route badge.`);
if (texasRouteLayer.layout?.['icon-text-fit'] !== 'both') fail(`${contract.layers.texasRouteRef} must text-fit the owned route badge.`);

for (const token of ['setMissingStyleImageResolver', 'map.addImage', 'stretchX', 'stretchY', 'content']) {
  if (!routeBadgeSource.includes(token)) fail(`owned Texas route badge resolver is missing ${token}.`);
}
const resolverInstall = broadcastMapSource.indexOf('installBroadcastRouteImageResolver(map)');
const styleInstall = broadcastMapSource.indexOf('map.setStyle(broadcastMapStyle)');
if (resolverInstall < 0 || styleInstall < 0 || resolverInstall > styleInstall) {
  fail('owned route-image resolver must be installed before the broadcast style.');
}


if (!contract.basemapModes || !Array.isArray(contract.basemapModes.broadcast) || !Array.isArray(contract.basemapModes.satellite)) {
  fail('basemap mode ownership contract is missing.');
}
const expectedBroadcastBase = [
  contract.layers.relief, contract.layers.landcover, contract.layers.urban, contract.layers.water, contract.layers.waterway,
];
if (JSON.stringify(contract.basemapModes.broadcast) !== JSON.stringify(expectedBroadcastBase)) fail('broadcast basemap mode ownership drifted.');
if (JSON.stringify(contract.basemapModes.satellite) !== JSON.stringify([contract.layers.satellite])) fail('satellite basemap mode ownership drifted.');
const referenceOwners = new Set(Object.values(contract.groups).flat());
const basemapOwners = new Set();
for (const [mode, ids] of Object.entries(contract.basemapModes)) {
  for (const id of ids) {
    if (referenceOwners.has(id)) fail(`basemap layer ${id} must not also belong to a reference visibility group.`);
    if (basemapOwners.has(id)) fail(`basemap layer ${id} is owned by more than one mode.`);
    basemapOwners.add(id);
    if (!contract.planes.underWeather.includes(id)) fail(`basemap mode ${mode} owns ${id} outside the under-weather plane.`);
  }
}
const satelliteIndex = styleLayerIds.indexOf(contract.layers.satellite);
const backgroundIndex = styleLayerIds.indexOf(contract.layers.background);
const firstRoadIndex = styleLayerIds.indexOf(contract.layers.roadMinorCasing);
if (!(backgroundIndex < satelliteIndex && satelliteIndex < firstRoadIndex)) fail('satellite imagery must remain below road geometry and weather.');

const csp = String(tauriConfig.app?.security?.csp ?? '');
for (const directive of ['connect-src', 'img-src']) {
  const section = csp.split(';').map((value) => value.trim()).find((value) => value === directive || value.startsWith(`${directive} `));
  if (!section?.includes('https://basemap.nationalmap.gov')) fail(`Tauri CSP ${directive} does not allow the USGS satellite provider.`);
}
for (const token of ['applyBasemapMode', 'BROADCAST_BASEMAP_MODES', 'basemapModeRef']) {
  if (!broadcastMapSource.includes(token)) fail(`BroadcastMap satellite mode wiring is missing ${token}.`);
}
if (!broadcastMapSource.includes('applyBasemapMode(map, basemapModeRef.current)')) fail('BroadcastMap does not apply the selected basemap mode during initial map load.');
if (!broadcastMapSource.includes('applyBasemapMode(map, basemapMode)')) fail('BroadcastMap does not apply live basemap-mode changes.');
if ((broadcastMapSource.match(/\.setStyle\(/g) ?? []).length !== 1) fail('BroadcastMap must contain exactly one setStyle() call; basemap switching must not reload the MapLibre style.');
for (const token of ['setBasemapMode', "'satellite'", 'SATELLITE']) {
  if (!appSource.includes(token)) fail(`operator satellite basemap control is missing ${token}.`);
}
if (!appSource.includes("useState<BroadcastBasemapMode>('broadcast')")) fail('Accepted broadcast map must remain the startup basemap mode.');

const planeOrder = [
  ...contract.planes.underWeather,
  contract.planes.weatherAnchor,
  ...contract.planes.aboveWeather,
];
if (JSON.stringify(styleLayerIds) !== JSON.stringify(planeOrder)) {
  fail('style layer order does not exactly match under-weather / weather-anchor / above-weather planes.');
}
if (contract.planes.weatherAnchor !== contract.layers.weatherAnchor) fail('weather anchor ID mismatch.');
if (contract.weatherInsertBefore !== contract.layers.countyBoundary) fail('weather insertion must remain before county boundary.');

const owners = new Map();
for (const [group, ids] of Object.entries(contract.groups)) {
  unique(ids, `${group} group`);
  for (const id of ids) {
    if (!styleLayerIds.includes(id)) fail(`${group} owns nonexistent layer ${id}.`);
    const previous = owners.get(id);
    if (previous) fail(`layer ${id} is owned by both ${previous} and ${group}.`);
    owners.set(id, group);
  }
}

const under = new Set(contract.planes.underWeather);
for (const id of [
  contract.layers.roadMinorCasing,
  contract.layers.roadMinor,
  contract.layers.roadSecondaryCasing,
  contract.layers.roadSecondary,
  contract.layers.roadPrimaryCasing,
  contract.layers.roadPrimary,
  contract.layers.roadTrunkCasing,
  contract.layers.roadTrunk,
  contract.layers.roadMotorwayCasing,
  contract.layers.roadMotorway,
]) {
  if (!under.has(id)) fail(`road geometry layer ${id} is not below the weather plane.`);
}

const above = new Set(contract.planes.aboveWeather);
for (const id of [
  contract.layers.interstateShield,
  contract.layers.usHighwayShield,
  contract.layers.texasRouteRef,
  contract.layers.cityMajor,
  contract.layers.cityRegional,
  contract.layers.cityTown,
  contract.layers.cityMinor,
  contract.layers.countyBoundary,
  contract.layers.countyLabel,
]) {
  if (!above.has(id)) fail(`reference layer ${id} is not above the weather plane.`);
}

const styleText = JSON.stringify(style);
for (const forbidden of ['tile.openstreetmap.org', '/styles/liberty', '/styles/bright', '/styles/positron']) {
  if (styleText.includes(forbidden)) fail(`generic finished basemap dependency is forbidden: ${forbidden}.`);
}

console.log('RBRWX Broadcast Map Foundation structural contract: PASS');

const interstate = layerById(contract.layers.interstateShield);
if (interstate.layout['icon-image'][1] !== 'rbrwx-us-interstate_') fail('Interstates must use owned full-color shields.');
if (interstate.paint['text-color'] !== '#ffffff') fail('Interstate numbers must remain white on blue.');
if (!routeBadgeSource.includes('sdf: false')) fail('Full-color Interstate artwork must not use SDF tinting.');
