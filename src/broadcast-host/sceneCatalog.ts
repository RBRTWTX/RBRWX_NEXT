import type { BroadcastSceneDefinition } from '../broadcast';

export const RBRWX_SCENE_CATALOG: readonly BroadcastSceneDefinition[] = [
  { id: 'current-observations', title: 'Current Conditions', subtitle: 'NWS observed temperatures across visible map', category: 'CURRENT', contentKey: 'current.observations', defaultHoldMs: 8000 },
  { id: 'current-radar', title: 'Current Radar', subtitle: 'NWS WSR-88D site radar · KEWX default', category: 'CURRENT', contentKey: 'current.radar', weatherKeyId: 'noaa.nowcoast.reflectivity', defaultHoldMs: 8000 },
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
  { id: 'graphic-right-now', title: 'Right Now', subtitle: 'Current conditions graphic', category: 'FORECAST', contentKey: 'graphic.right-now', defaultHoldMs: 10000 },
  { id: 'graphic-today', title: 'Today', subtitle: 'Single-period daytime forecast', category: 'FORECAST', contentKey: 'graphic.today', defaultHoldMs: 10000 },
  { id: 'graphic-tonight', title: 'Tonight', subtitle: 'Single-period nighttime forecast', category: 'FORECAST', contentKey: 'graphic.tonight', defaultHoldMs: 10000 },
  { id: 'graphic-today-tonight', title: 'Today & Tonight', subtitle: 'Two-panel day and night forecast', category: 'FORECAST', contentKey: 'graphic.today-tonight', defaultHoldMs: 12000 },
  { id: 'graphic-hourly', title: 'Hourly', subtitle: 'Upcoming hourly forecast', category: 'FORECAST', contentKey: 'graphic.hourly', defaultHoldMs: 12000 },
  { id: 'graphic-seven-day', title: '7-Day Forecast', subtitle: 'Seven-day forecast graphic', category: 'FORECAST', contentKey: 'graphic.seven-day', defaultHoldMs: 14000 },
  { id: 'graphic-planner', title: 'Planner', subtitle: 'Four-period planning graphic', category: 'FORECAST', contentKey: 'graphic.planner', defaultHoldMs: 12000 },
  { id: 'graphic-weekend', title: 'Weekend', subtitle: 'Saturday and Sunday forecast', category: 'FORECAST', contentKey: 'graphic.weekend', defaultHoldMs: 12000 },
  { id: 'graphic-need-to-know', title: 'Need to Know', subtitle: 'Editable on-air message board', category: 'GRAPHIC', contentKey: 'graphic.need-to-know', defaultHoldMs: 14000 },
  { id: 'graphic-blank', title: 'Blank Canvas', subtitle: 'Custom text, icons, PNG and SVG graphic', category: 'GRAPHIC', contentKey: 'graphic.blank', defaultHoldMs: 12000 },
  { id: 'qpf-day1', title: 'QPF Day 1', subtitle: 'WPC 24-hour quantitative precipitation forecast', category: 'QPF', contentKey: 'qpf.day1', defaultHoldMs: 10000 },
  { id: 'qpf-day2', title: 'QPF Day 2', subtitle: 'WPC 24-hour quantitative precipitation forecast', category: 'QPF', contentKey: 'qpf.day2', defaultHoldMs: 10000 },
  { id: 'qpf-day3', title: 'QPF Day 3', subtitle: 'WPC 24-hour quantitative precipitation forecast', category: 'QPF', contentKey: 'qpf.day3', defaultHoldMs: 10000 },
  { id: 'qpf-day7', title: 'QPF 7-Day Total', subtitle: 'WPC 168-hour quantitative precipitation forecast', category: 'QPF', contentKey: 'qpf.day7', defaultHoldMs: 12000 },
];

export const RBRWX_INITIAL_RUNDOWN_SCENE_IDS = ['base-broadcast-map'] as const;
