import type { BroadcastSceneDefinition } from '../broadcast';

export const RBRWX_SCENE_CATALOG: readonly BroadcastSceneDefinition[] = [
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
