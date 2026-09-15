import type { Observation } from './model';

type RecordValue = Record<string, unknown>;
export interface ObservationViewport { west: number; south: number; east: number; north: number; zoom: number }

const record = (v: unknown): RecordValue => v !== null && typeof v === 'object' ? v as RecordValue : {};
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

function quantity(value: unknown, unit: string): number | null {
  const v = record(value);
  return v.unitCode === `wmoUnit:${unit}` && typeof v.value === 'number' && Number.isFinite(v.value) && !['X', 'Z'].includes(String(v.qualityControl)) ? v.value : null;
}

export function parseObservation(raw: unknown, station: { id: string; name: string; lng: number; lat: number }): Observation | null {
  const p = record(record(raw).properties);
  const time = Date.parse(String(p.timestamp));
  if (!Number.isFinite(time)) return null;
  return {
    ...station,
    time,
    temperature: quantity(p.temperature, 'degC'),
    dewpoint: quantity(p.dewpoint, 'degC'),
    wind: quantity(p.windSpeed, 'km_h-1'),
    gust: quantity(p.windGust, 'km_h-1'),
    humidity: quantity(p.relativeHumidity, 'percent'),
    description: typeof p.textDescription === 'string' ? p.textDescription : 'Conditions unavailable',
    cached: false,
  };
}

async function json(url: string, signal: AbortSignal): Promise<RecordValue> {
  if (new URL(url).origin !== 'https://api.weather.gov') throw Error('Unexpected observation service');
  const response = await fetch(url, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    headers: { Accept: 'application/geo+json' },
  });
  if (!response.ok) throw Error(`NWS observations unavailable (${response.status})`);
  return record(await response.json());
}

export function observationStationCap(zoom: number): number {
  return Math.round(clamp(10 * Math.pow(2, (zoom - 4) * .48), 12, 96));
}

export function observationSamplePoints(view: ObservationViewport): Array<[number, number]> {
  const west = clamp(view.west, -179.9, 179.9), east = clamp(view.east, -179.9, 179.9);
  const south = clamp(view.south, -89.5, 89.5), north = clamp(view.north, -89.5, 89.5);
  const midX = (west + east) / 2, midY = (south + north) / 2;
  const left = west * .82 + midX * .18, right = east * .82 + midX * .18;
  const bottom = south * .82 + midY * .18, top = north * .82 + midY * .18;
  // Very wide views need more discovery points, not fewer: a single NWS point only
  // exposes the stations associated with one forecast office and would cluster
  // a national/regional map around its center. Label density is still governed
  // independently by observationStationCap(zoom).
  if (view.zoom < 5) {
    const samples: Array<[number, number]> = [];
    for (const lat of [bottom, midY, top]) for (const lng of [left, midX, right]) samples.push([lng, lat]);
    return samples;
  }
  if (view.zoom < 7) return [[midX, midY], [left, bottom], [right, bottom], [left, top], [right, top]];
  const samples: Array<[number, number]> = [];
  for (const lat of [bottom, midY, top]) for (const lng of [left, midX, right]) samples.push([lng, lat]);
  return samples;
}


export function selectDistributedStations<T extends { id: string; lng: number; lat: number }>(items: T[], view: ObservationViewport, cap: number): T[] {
  if (items.length <= cap) return [...items];
  const west = Math.min(view.west, view.east), east = Math.max(view.west, view.east);
  const south = Math.min(view.south, view.north), north = Math.max(view.south, view.north);
  const lonSpan = Math.max(.01, east - west), latSpan = Math.max(.01, north - south);
  const aspect = Math.max(.5, Math.min(2.5, lonSpan * Math.cos(((south + north) / 2) * Math.PI / 180) / latSpan));
  const cols = Math.max(1, Math.round(Math.sqrt(cap * aspect)));
  const rows = Math.max(1, Math.ceil(cap / cols));
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const x = Math.max(0, Math.min(cols - 1, Math.floor((item.lng - west) / lonSpan * cols)));
    const y = Math.max(0, Math.min(rows - 1, Math.floor((item.lat - south) / latSpan * rows)));
    const key = `${x},${y}`, bucket = buckets.get(key) ?? [];
    bucket.push(item); buckets.set(key, bucket);
  }
  for (const [key, bucket] of buckets) {
    const [x, y] = key.split(',').map(Number);
    const cellLng = west + (x + .5) / cols * lonSpan, cellLat = south + (y + .5) / rows * latSpan;
    const cos = Math.cos(cellLat * Math.PI / 180);
    bucket.sort((a, b) => Math.hypot((a.lng - cellLng) * cos, a.lat - cellLat) - Math.hypot((b.lng - cellLng) * cos, b.lat - cellLat) || a.id.localeCompare(b.id));
  }
  const ordered = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).map(([, bucket]) => bucket);
  const selected: T[] = [];
  for (let depth = 0; selected.length < cap; depth++) {
    let added = false;
    for (const bucket of ordered) {
      const item = bucket[depth];
      if (!item) continue;
      selected.push(item); added = true;
      if (selected.length >= cap) break;
    }
    if (!added) break;
  }
  return selected;
}

function viewportKey(view: ObservationViewport): string {
  const centerLat = (view.south + view.north) / 2, centerLng = (view.west + view.east) / 2;
  return `${centerLat.toFixed(2)},${centerLng.toFixed(2)},z${Math.floor(view.zoom * 2) / 2}`;
}

function expanded(view: ObservationViewport) {
  const dx = Math.max(.2, (view.east - view.west) * .16), dy = Math.max(.2, (view.north - view.south) * .16);
  return { west: view.west - dx, east: view.east + dx, south: view.south - dy, north: view.north + dy };
}

export class ObservationsClient {
  private areas = new Map<string, Observation[]>();
  private cache = new Map<string, { received: number; data: Observation }>();
  private stationUrls = new Map<string, { received: number; url: string }>();

  /** Compatibility path retained for verification and direct point use. */
  async load(lng: number, lat: number, signal: AbortSignal): Promise<Observation[]> {
    return this.loadViewport({ west: lng - .8, east: lng + .8, south: lat - .6, north: lat + .6, zoom: 8 }, signal);
  }

  async loadViewport(view: ObservationViewport, signal: AbortSignal): Promise<Observation[]> {
    const area = viewportKey(view);
    try {
      const data = await this.loadFresh(view, signal);
      this.areas.set(area, data);
      while (this.areas.size > 50) this.areas.delete(this.areas.keys().next().value!);
      return data;
    } catch (error) {
      if (signal.aborted) throw error;
      const cached = this.areas.get(area);
      if (cached?.length) return cached.map(o => ({ ...o, cached: true }));
      throw error;
    }
  }

  private async stationCollectionUrl(lng: number, lat: number, signal: AbortSignal): Promise<string | null> {
    const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    const cached = this.stationUrls.get(key);
    if (cached && Date.now() - cached.received < 3600000) return cached.url;
    try {
      const point = await json(`https://api.weather.gov/points/${lat.toFixed(4)},${lng.toFixed(4)}`, signal);
      const url = record(point.properties).observationStations;
      if (typeof url !== 'string') return null;
      this.stationUrls.set(key, { received: Date.now(), url });
      while (this.stationUrls.size > 150) this.stationUrls.delete(this.stationUrls.keys().next().value!);
      return url;
    } catch (error) {
      if (signal.aborted) throw error;
      return null;
    }
  }

  private async loadFresh(view: ObservationViewport, signal: AbortSignal): Promise<Observation[]> {
    const centerLng = (view.west + view.east) / 2, centerLat = (view.south + view.north) / 2;
    const urls = new Set<string>();
    const discovered = await Promise.all(observationSamplePoints(view).map(async ([lng, lat]) => {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      return this.stationCollectionUrl(lng, lat, signal);
    }));
    for (const url of discovered) if (url) urls.add(url);
    if (!urls.size) throw Error('No NWS observation stations for this viewport');

    const stations = new Map<string, { id: string; name: string; lng: number; lat: number }>();
    const lists: RecordValue[] = [];
    await Promise.all([...urls].map(async url => {
      try { lists.push(await json(url, signal)); }
      catch (error) { if (signal.aborted) throw error; }
    }));
    if (!lists.length) throw Error('NWS station collections are unavailable for this viewport');
    for (const list of lists) {
      for (const feature of Array.isArray(list.features) ? list.features : []) {
        const p = record(record(feature).properties), coordinates = record(record(feature).geometry).coordinates;
        if (!Array.isArray(coordinates) || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1]) || typeof p.stationIdentifier !== 'string' || !/^[A-Z0-9_-]{3,12}$/.test(p.stationIdentifier)) continue;
        stations.set(p.stationIdentifier, { id: p.stationIdentifier, name: String(p.name ?? p.stationIdentifier), lng: Number(coordinates[0]), lat: Number(coordinates[1]) });
      }
    }

    const box = expanded(view), cos = Math.cos(centerLat * Math.PI / 180);
    const visibleStations = [...stations.values()]
      .filter(s => s.lng >= box.west && s.lng <= box.east && s.lat >= box.south && s.lat <= box.north);
    const candidates = selectDistributedStations(visibleStations, view, observationStationCap(view.zoom))
      .sort((a, b) => Math.hypot((a.lng - centerLng) * cos, a.lat - centerLat) - Math.hypot((b.lng - centerLng) * cos, b.lat - centerLat));

    if (!candidates.length) throw Error('No station observations available in the visible map');
    const results: Observation[] = [];
    for (let offset = 0; offset < candidates.length; offset += 6) {
      await Promise.all(candidates.slice(offset, offset + 6).map(async station => {
        if (signal.aborted) return;
        const cached = this.cache.get(station.id);
        if (cached && Date.now() - cached.received < 60000) {
          results.push({ ...cached.data, cached: true });
          return;
        }
        try {
          const raw = await json(`https://api.weather.gov/stations/${station.id}/observations/latest`, signal);
          const data = parseObservation(raw, station);
          if (!data) throw Error('Missing observation timestamp');
          this.cache.set(station.id, { received: Date.now(), data });
          results.push(data);
        } catch {
          if (!signal.aborted && cached) results.push({ ...cached.data, cached: true });
        }
      }));
    }
    while (this.cache.size > 500) {
      const first = this.cache.keys().next().value;
      if (first) this.cache.delete(first); else break;
    }
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (!results.length) throw Error('No current station observations available in the visible map');
    return results.sort((a, b) => a.id.localeCompare(b.id));
  }
}
