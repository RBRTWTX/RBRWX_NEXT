import rawContract from './broadcastMapContract.json';

export const BROADCAST_MAP_SCHEMA_VERSION = rawContract.schemaVersion;
export const BROADCAST_PROVIDERS = rawContract.providers;
export const BROADCAST_SOURCE_IDS = rawContract.sources;
export const BROADCAST_IMAGE_IDS = rawContract.images;
export const BROADCAST_LAYER_IDS = rawContract.layers;
export const BROADCAST_LAYER_GROUPS = rawContract.groups;
export const BROADCAST_BASEMAP_MODES = rawContract.basemapModes;
export const BROADCAST_MAP_PLANES = rawContract.planes;
export const BROADCAST_WEATHER_INSERT_BEFORE = rawContract.weatherInsertBefore;

export type BroadcastLayerGroup = keyof typeof BROADCAST_LAYER_GROUPS;
export type BroadcastBasemapMode = keyof typeof BROADCAST_BASEMAP_MODES;

export function assertBroadcastLayerSeparation(): void {
  const owners = new Map<string, BroadcastLayerGroup>();

  for (const [group, ids] of Object.entries(BROADCAST_LAYER_GROUPS) as [BroadcastLayerGroup, string[]][]) {
    for (const id of ids) {
      const priorOwner = owners.get(id);
      if (priorOwner) {
        throw new Error(`Broadcast contract violation: layer ${id} is owned by both ${priorOwner} and ${group}.`);
      }
      owners.set(id, group);
    }
  }

  if (BROADCAST_MAP_PLANES.weatherAnchor !== BROADCAST_LAYER_IDS.weatherAnchor) {
    throw new Error('Broadcast contract violation: weather anchor ID mismatch.');
  }

  if (BROADCAST_WEATHER_INSERT_BEFORE !== BROADCAST_LAYER_IDS.countyBoundary) {
    throw new Error('Broadcast contract violation: weather insertion point moved away from county boundary.');
  }

  const underWeather = new Set<string>(BROADCAST_MAP_PLANES.underWeather);
  const basemapOwners = new Map<string, BroadcastBasemapMode>();
  for (const [mode, ids] of Object.entries(BROADCAST_BASEMAP_MODES) as [BroadcastBasemapMode, string[]][]) {
    for (const id of ids) {
      if (!underWeather.has(id)) {
        throw new Error(`Broadcast contract violation: basemap mode ${mode} owns layer ${id} outside the under-weather plane.`);
      }
      if (owners.has(id)) {
        throw new Error(`Broadcast contract violation: basemap layer ${id} also belongs to reference group ${owners.get(id)}.`);
      }
      const previous = basemapOwners.get(id);
      if (previous) {
        throw new Error(`Broadcast contract violation: basemap layer ${id} is owned by both ${previous} and ${mode}.`);
      }
      basemapOwners.set(id, mode);
    }
  }
}
