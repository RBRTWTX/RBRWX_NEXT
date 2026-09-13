import type { BroadcastSceneDefinition } from '../broadcast';

export const RBRWX_SCENE_CATALOG: readonly BroadcastSceneDefinition[] = [
  { id: 'current-observations', title: 'Current Conditions', subtitle: 'NWS station observations near map center', category: 'CURRENT', contentKey: 'current.observations', defaultHoldMs: 8000 },
  { id: 'current-radar', title: 'Current Radar', subtitle: 'NOAA MRMS · CONUS base reflectivity', category: 'CURRENT', contentKey: 'current.radar', weatherKeyId: 'noaa.nowcoast.reflectivity', defaultHoldMs: 8000 },
  { id: 'current-satellite', title: 'Current Satellite', subtitle: 'NOAA GOES East/West · Band 14 infrared', category: 'CURRENT', contentKey: 'current.satellite', weatherKeyId: 'noaa.nowcoast.infrared', defaultHoldMs: 8000 },
  {
    id: 'base-broadcast-map',
    title: 'Broadcast Map',
    subtitle: 'Geographic broadcast foundation',
    category: 'BASE',
    contentKey: 'map.broadcast',
    defaultHoldMs: 8000,
  },
  {
    id: 'base-satellite-map',
    title: 'Satellite Map',
    subtitle: 'Reference imagery basemap',
    category: 'BASE',
    contentKey: 'map.satellite',
    defaultHoldMs: 8000,
  },
];

export const RBRWX_INITIAL_RUNDOWN_SCENE_IDS = ['base-broadcast-map'] as const;
