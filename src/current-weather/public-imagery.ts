import type { Map as WeatherMap } from 'maplibre-gl';
import type { RadarSite } from './model';

export type ImageryProduct = 'radar' | 'satellite';
export const services = {
  radar: { url: 'https://nowcoast.noaa.gov/geoserver/observations/weather_radar/wms', layer: 'conus_base_reflectivity_mosaic' },
  satellite: { url: 'https://nowcoast.noaa.gov/geoserver/satellite/wms', layer: 'goes_longwave_imagery' },
} as const;

export function publishedTimes(xml: string, layer: string): number[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw Error('NOAA returned invalid capabilities XML');
  const node = Array.from(doc.getElementsByTagNameNS('*', 'Layer')).find(l => Array.from(l.children).some(c => c.localName === 'Name' && (c.textContent === layer || c.textContent?.endsWith(`:${layer}`))));
  if (!node) throw Error(`NOAA weather layer ${layer} is absent from capabilities`);
  const dimension = [...Array.from(node.getElementsByTagNameNS('*', 'Dimension')), ...Array.from(node.getElementsByTagNameNS('*', 'Extent'))].find(c => c.getAttribute('name') === 'time');
  const times = (dimension?.textContent ?? '').split(',').flatMap(s => {
    const text = s.trim();
    if (!text) return [];
    if (text.includes('/')) {
      const [start, end, period] = text.split('/');
      const a = Date.parse(start), b = Date.parse(end);
      const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(period ?? '');
      if (!Number.isFinite(a) || !Number.isFinite(b) || !match) return [];
      const step = ((Number(match[1] ?? 0) * 3600) + (Number(match[2] ?? 0) * 60) + Number(match[3] ?? 0)) * 1000;
      if (!step) return [];
      const values: number[] = [];
      const earliest = Math.max(a, b - step * 199);
      const aligned = a + Math.max(0, Math.ceil((earliest - a) / step)) * step;
      for (let value = aligned; value <= b && values.length < 200; value += step) values.push(value);
      return values;
    }
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? [parsed] : [];
  });
  if (!times.length) throw Error(`NOAA has no explicit published frames for ${layer}`);
  return [...new Set(times)].sort((a, b) => a - b).slice(-12);
}

export function imageRequest(product: ImageryProduct, time: number, bounds: number[], width: number, height: number): string {
  const s = services[product], u = new URL(s.url);
  const p = { SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetMap', LAYERS: s.layer, STYLES: '', FORMAT: 'image/png', TRANSPARENT: 'TRUE', SRS: 'EPSG:3857', BBOX: bounds.join(','), WIDTH: String(width), HEIGHT: String(height), TIME: new Date(time).toISOString() };
  for (const [k, v] of Object.entries(p)) u.searchParams.set(k, v);
  return u.href;
}

async function request(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]), credentials: 'omit' });
  if (!response.ok) throw Error(`NOAA HTTP ${response.status}`);
  return response;
}

function dataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(Error('Could not decode NOAA image'));
    reader.readAsDataURL(blob);
  });
}

function viewportRequest(map: WeatherMap) {
  const b = map.getBounds(), west = Math.max(-180, b.getWest()), east = Math.min(180, b.getEast()), south = Math.max(-85, b.getSouth()), north = Math.min(85, b.getNorth());
  if (west >= east || south >= north) throw Error('Move the map into NOAA coverage');
  const mercX = (lng: number) => lng * 20037508.342789244 / 180;
  const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 6378137;
  const canvas = map.getCanvas(), scale = Math.min(1, 1536 / Math.max(canvas.width, canvas.height));
  return {
    geographic: [west, north, east, south] as [number, number, number, number],
    mercator: [mercX(west), mercY(south), mercX(east), mercY(north)],
    width: Math.max(64, Math.round(canvas.width * scale)),
    height: Math.max(64, Math.round(canvas.height * scale)),
  };
}

export interface PublicImageryOptions { product: ImageryProduct; anchor: string; opacity: number; onError: (message: string) => void }

/** Two image sources keep the last completed frame visible until its replacement loads. */
export class PublicImagery {
  currentLoadedTimeKey: number | null = null;
  private times: number[] = [];
  private selected: number | null = null;
  private listener: ((state: Record<string, unknown>) => void) | null = null;
  private lifetime = new AbortController();
  private frame: AbortController | null = null;
  private serial = 0;
  private active: string | null = null;
  private owned = new Set<string>();
  private moveTimer: ReturnType<typeof setTimeout> | null = null;
  private pending = false;
  private opacity: number;
  private prefix = `rbrwx-public-${Math.random().toString(36).slice(2)}`;
  constructor(private map: WeatherMap, private options: PublicImageryOptions) { this.opacity = options.opacity; }
  on(_event: string, listener: (state: Record<string, unknown>) => void) { this.listener = listener; }
  private emit() { this.listener?.({ availableTimestamps: this.times, mrmsTimestamp: this.selected }); }
  async initialize() { this.map.on('moveend', this.move); this.map.on('resize', this.move); await this.refreshData(); }
  async refreshData() {
    const s = services[this.options.product];
    const response = await request(`${s.url}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities`, this.lifetime.signal);
    const times = publishedTimes(await response.text(), s.layer);
    if (this.lifetime.signal.aborted) return;
    this.times = times; this.emit();
    await this.load(times[times.length - 1]);
  }
  private move = () => { if (this.moveTimer) clearTimeout(this.moveTimer); this.moveTimer = setTimeout(() => { if (this.selected !== null) void this.load(this.selected).catch(e => this.options.onError(e instanceof Error ? e.message : 'NOAA image failed')); }, 400); };
  async setMRMSTimestamp(time: number) {
    const requested = time * 1000;
    if (!this.times.length) return;
    const nearest = this.times.reduce((best, value) => Math.abs(value - requested) < Math.abs(best - requested) ? value : best, this.times[0]);
    await this.load(nearest);
  }
  async setSatelliteTimestamp(time: number) { await this.load(time * 1000); }
  async setUnits(_units: string) { }
  async setOpacity(value: number) { this.opacity = value; if (this.active && this.map.getLayer(this.active)) this.map.setPaintProperty(this.active, 'raster-opacity', value); }
  private remove(id: string) { if (this.map.getLayer(id)) this.map.removeLayer(id); if (this.map.getSource(id)) this.map.removeSource(id); this.owned.delete(id); }
  private async load(time: number) {
    if (this.lifetime.signal.aborted || !this.times.includes(time)) return;
    this.frame?.abort(); const frame = new AbortController(); this.frame = frame;
    const signal = AbortSignal.any([frame.signal, this.lifetime.signal]); const serial = ++this.serial;
    this.selected = time; this.pending = true; this.emit();
    const view = viewportRequest(this.map);
    let id: string | null = null;
    try {
      const response = await request(imageRequest(this.options.product, time, view.mercator, view.width, view.height), signal);
      if (!response.headers.get('content-type')?.toLowerCase().includes('image/png')) throw Error('NOAA returned a service error instead of an image');
      const blob = await response.blob(); if (blob.size < 8) throw Error('NOAA returned an empty image');
      const url = await dataURL(blob); if (signal.aborted || serial !== this.serial) return;
      id = `${this.prefix}-${serial}`; const next = id; this.owned.add(next);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => finish(Error('NOAA image could not be drawn within 20 seconds')), 20000);
        const cleanup = () => { clearTimeout(timer); this.map.off('sourcedata', loaded); signal.removeEventListener('abort', cancel); };
        const finish = (error?: Error) => { cleanup(); error ? reject(error) : resolve(); };
        const loaded = (e: { sourceId?: string; isSourceLoaded?: boolean }) => { if (e.sourceId === next && e.isSourceLoaded) finish(); };
        const cancel = () => finish(new DOMException('Cancelled', 'AbortError'));
        this.map.on('sourcedata', loaded); signal.addEventListener('abort', cancel, { once: true });
        try { this.map.addSource(next, { type: 'image', url, coordinates: [[view.geographic[0], view.geographic[1]], [view.geographic[2], view.geographic[1]], [view.geographic[2], view.geographic[3]], [view.geographic[0], view.geographic[3]]] }); this.map.addLayer({ id: next, type: 'raster', source: next, paint: { 'raster-opacity': 0, 'raster-fade-duration': 0 } }, this.options.anchor); }
        catch (e) { finish(e instanceof Error ? e : Error('Could not add NOAA imagery')); }
      });
      if (signal.aborted || serial !== this.serial) return;
      const old = this.active; this.active = next; this.map.setPaintProperty(next, 'raster-opacity', this.opacity);
      if (old) this.remove(old);
      await new Promise<void>(resolve => { const done = () => { this.map.off('render', done); signal.removeEventListener('abort', done); resolve(); }; this.map.once('render', done); signal.addEventListener('abort', done, { once: true }); this.map.triggerRepaint(); });
      if (!signal.aborted && serial === this.serial) { this.currentLoadedTimeKey = time; this.pending = false; }
    } catch (e) { if (!signal.aborted) throw e; }
    finally { if (id && id !== this.active) this.remove(id); if (serial === this.serial) this.pending = false; }
  }
  get loading() { return this.pending; }
  destroy() { this.lifetime.abort(); this.frame?.abort(); if (this.moveTimer) clearTimeout(this.moveTimer); this.map.off('moveend', this.move); this.map.off('resize', this.move); for (const id of [...this.owned]) this.remove(id); this.listener = null; }
}

// Exact palette supplied for this project as RadarScope1 (1).pal.
export const RADARSCOPE_REFLECTIVITY_PAL = `product: BR
units: dBZ
step: 5


color4: -15 0 0 0 0
color: 5 29 37 60
color: 17.5 89 155 171
color: 22.5  33 186 72
color: 32.5 5 101 1
color: 37.5 251 252 0 199 176 0
color: 42.5 253 149 2 172 92 2
color: 50 253 38 0 135 43 22
color: 60 193 148 179 200 23 119
color: 70 165 2 215 64 0 146
color: 75 135 255 253 54 120 142 
color: 80 173 99 64 
color: 85 105 0 4
color: 95 0 0 0`;

type PaletteStop = { value: number; start: [number, number, number, number]; end?: [number, number, number, number] };
function parseRadarScopePalette(text: string): PaletteStop[] {
  const stops: PaletteStop[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split(';')[0].trim();
    const match = /^(color4|color):\s*(.+)$/i.exec(line);
    if (!match) continue;
    const values = match[2].trim().split(/\s+/).map(Number);
    const is4 = match[1].toLowerCase() === 'color4', width = is4 ? 4 : 3;
    if (values.length < 1 + width || values.some(v => !Number.isFinite(v))) continue;
    const value = values[0], first = values.slice(1, 1 + width), second = values.slice(1 + width, 1 + width * 2);
    const rgba = (parts: number[]): [number, number, number, number] => [parts[0], parts[1], parts[2], is4 ? parts[3] : 255];
    stops.push({ value, start: rgba(first), end: second.length === width ? rgba(second) : undefined });
  }
  return stops.sort((a, b) => a.value - b.value);
}

const RADARSCOPE_STOPS = parseRadarScopePalette(RADARSCOPE_REFLECTIVITY_PAL);
const hex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
const colorHex = (rgba: [number, number, number, number]) => `#${hex(rgba[0])}${hex(rgba[1])}${hex(rgba[2])}`;

export function radarScopeSld(layer = 'SR_BREF'): string {
  const entries: string[] = [];
  for (let i = 0; i < RADARSCOPE_STOPS.length; i++) {
    const current = RADARSCOPE_STOPS[i];
    const opacity = (current.start[3] / 255).toFixed(4);
    entries.push(`<sld:ColorMapEntry color="${colorHex(current.start)}" quantity="${current.value}" opacity="${opacity}"/>`);
    const next = RADARSCOPE_STOPS[i + 1];
    if (next) {
      const end = current.end ?? next.start;
      const endOpacity = (end[3] / 255).toFixed(4);
      entries.push(`<sld:ColorMapEntry color="${colorHex(end)}" quantity="${(next.value - .001).toFixed(3)}" opacity="${endOpacity}"/>`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?><sld:StyledLayerDescriptor version="1.0.0" xmlns:sld="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><sld:NamedLayer><sld:Name>${layer}</sld:Name><sld:UserStyle><sld:FeatureTypeStyle><sld:Rule><sld:RasterSymbolizer><sld:ColorMap type="ramp">${entries.join('')}</sld:ColorMap></sld:RasterSymbolizer></sld:Rule></sld:FeatureTypeStyle></sld:UserStyle></sld:NamedLayer></sld:StyledLayerDescriptor>`;
}

const RADAR_SITE_URL = 'https://opengeo.ncep.noaa.gov/geoserver/nws/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=nws%3Aradar_sites&outputFormat=application%2Fjson';
const CITY_ALIASES: Record<string, string> = {
  KEWX: 'San Antonio / Austin', KDFX: 'Del Rio', KGRK: 'Central Texas / Fort Cavazos', KCRP: 'Corpus Christi',
  KHGX: 'Houston / Galveston', KFWS: 'Dallas / Fort Worth', KBRO: 'Brownsville', KSJT: 'San Angelo',
  KMAF: 'Midland / Odessa', KLBB: 'Lubbock', KAMA: 'Amarillo', KEPZ: 'El Paso', KSHV: 'Shreveport',
};

function radarShortId(id: string) { return id.startsWith('K') && id.length === 4 ? id.slice(1) : id; }

export async function fetchRadarSites(signal: AbortSignal): Promise<RadarSite[]> {
  const response = await fetch(RADAR_SITE_URL, { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]), headers: { Accept: 'application/json' }, credentials: 'omit' });
  if (!response.ok) throw Error(`NWS radar-site catalog unavailable (${response.status})`);
  const raw = await response.json() as { features?: Array<{ geometry?: { coordinates?: unknown[] }; properties?: Record<string, unknown> }> };
  const result: RadarSite[] = [];
  for (const feature of raw.features ?? []) {
    const p = feature.properties ?? {}, coordinates = feature.geometry?.coordinates;
    const id = typeof p.rda_id === 'string' ? p.rda_id.toUpperCase() : '';
    const lng = Array.isArray(coordinates) ? Number(coordinates[0]) : Number(p.lon), lat = Array.isArray(coordinates) ? Number(coordinates[1]) : Number(p.lat);
    const supportsSiteSuperRes = /^K[A-Z0-9]{3}$/.test(id) || /^P[A-Z0-9]{3}$/.test(id) || id === 'TJUA';
    if (!supportsSiteSuperRes || !Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    const name = String(p.name ?? id), wfo = String(p.wfo_id ?? '');
    result.push({ id, name, city: CITY_ALIASES[id] ?? name, wfo, lng, lat });
  }
  if (!result.some(site => site.id === 'KEWX')) throw Error('NWS radar-site catalog did not include KEWX');
  return result.sort((a, b) => (a.id === 'KEWX' ? -1 : b.id === 'KEWX' ? 1 : a.city.localeCompare(b.city) || a.id.localeCompare(b.id)));
}

function radarEndpoint(siteId: string) { return `https://opengeo.ncep.noaa.gov/geoserver/${siteId.toLowerCase()}/ows`; }
function radarCapabilities(siteId: string) { return `${radarEndpoint(siteId)}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities`; }

export function radarReflectivityLayer(xml: string, siteId: string): string {
  const names = [...xml.matchAll(/<(?:\w+:)?Name\b[^>]*>\s*([^<]+?)\s*<\/(?:\w+:)?Name>/gi)].map(match => match[1].trim());
  const site = siteId.toLowerCase();
  const local = (name: string) => name.split(':').at(-1)?.toLowerCase() ?? name.toLowerCase();
  const exact = names.find(name => {
    const value = local(name);
    return value === `${site}_sr_bref` || value === 'sr_bref';
  });
  if (exact) return exact;
  const suffix = names.find(name => local(name).endsWith('_sr_bref'));
  if (suffix) return suffix;
  throw Error(`${radarShortId(siteId)} capabilities do not advertise a site-qualified Super Resolution Base Reflectivity layer`);
}

export function radarImageRequest(siteId: string, layer: string, time: number, bounds: number[], width: number, height: number, useRadarScopePalette = true): string {
  const u = new URL(radarEndpoint(siteId));
  const p: Record<string, string> = {
    SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetMap', LAYERS: layer, STYLES: '', FORMAT: 'image/png', TRANSPARENT: 'TRUE',
    SRS: 'EPSG:3857', BBOX: bounds.join(','), WIDTH: String(width), HEIGHT: String(height), TIME: new Date(time).toISOString(),
  };
  if (useRadarScopePalette) p.SLD_BODY = radarScopeSld(layer);
  for (const [key, value] of Object.entries(p)) u.searchParams.set(key, value);
  return u.href;
}

export interface RadarImageryOptions extends PublicImageryOptions { product: 'radar'; mrmsEnabled?: boolean; onNotice?: (message: string) => void }

type RadarSiteRuntime = { layer: string; times: number[]; selected: number | null; activeLayer: string | null; serial: number };

export class RadarImagery {
  currentLoadedTimeKey: number | null = null;
  private listener: ((state: Record<string, unknown>) => void) | null = null;
  private lifetime = new AbortController();
  private siteFrames = new Map<string, AbortController>();
  private runtimes = new Map<string, RadarSiteRuntime>();
  private sites: RadarSite[] = [];
  private activeIds: string[] = ['KEWX'];
  private owned = new Set<string>();
  private moveTimer: ReturnType<typeof setTimeout> | null = null;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private sweepAngle = 0;
  private opacity: number;
  private paletteFallbackSites = new Set<string>();
  private prefix = `rbrwx-radar-${Math.random().toString(36).slice(2)}`;
  private mosaic: PublicImagery | null = null;
  private markerSource = `${this.prefix}-sites`;
  private markerLayer = `${this.prefix}-site-points`;
  private markerLabelLayer = `${this.prefix}-site-labels`;
  private sweepSource = `${this.prefix}-sweeps`;
  private sweepFillLayer = `${this.prefix}-sweep-fill`;
  private sweepLineLayer = `${this.prefix}-sweep-lines`;
  private clickHandler: ((event: any) => void) | null = null;

  constructor(private map: WeatherMap, private options: RadarImageryOptions) { this.opacity = options.opacity; }
  on(_event: string, listener: (state: Record<string, unknown>) => void) { this.listener = listener; }
  private emit() {
    const primary = this.activeIds[0] ?? null, runtime = primary ? this.runtimes.get(primary) : undefined;
    this.listener?.({
      availableTimestamps: runtime?.times ?? [], mrmsTimestamp: runtime?.selected ?? null,
      radarSites: this.sites, activeRadarIds: this.activeIds, primaryRadarId: primary, paletteFallback: primary ? this.paletteFallbackSites.has(primary) : false,
    });
  }

  async initialize() {
    this.sites = await fetchRadarSites(this.lifetime.signal);
    this.installRadarSiteLayers();
    this.map.on('moveend', this.move); this.map.on('resize', this.move);
    this.startSweep(); this.emit();
    if (this.options.mrmsEnabled) await this.setMRMSEnabled(true);
    await this.refreshData();
  }

  private mosaicAnchor() {
    const firstSiteLayer = this.activeIds.map(id => this.runtimes.get(id)?.activeLayer).find((id): id is string => !!id && !!this.map.getLayer(id));
    if (firstSiteLayer) return firstSiteLayer;
    if (this.map.getLayer(this.sweepFillLayer)) return this.sweepFillLayer;
    if (this.map.getLayer(this.markerLayer)) return this.markerLayer;
    return this.options.anchor;
  }

  async setMRMSEnabled(enabled: boolean) {
    this.options.mrmsEnabled = enabled;
    if (!enabled) {
      this.mosaic?.destroy(); this.mosaic = null;
      this.emit();
      return;
    }
    if (this.mosaic) return;
    const mosaic = new PublicImagery(this.map, {
      product: 'radar', anchor: this.mosaicAnchor(), opacity: Math.min(this.opacity, .48),
      onError: message => this.options.onNotice?.(`MRMS backup: ${message}`),
    });
    this.mosaic = mosaic;
    try {
      await mosaic.initialize();
      const selected = this.activeIds[0] ? this.runtimes.get(this.activeIds[0])?.selected : null;
      if (selected !== null && selected !== undefined) await mosaic.setMRMSTimestamp(selected / 1000);
    }
    catch (error) {
      if (this.mosaic === mosaic) { mosaic.destroy(); this.mosaic = null; }
      this.options.onNotice?.(`MRMS backup unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private installRadarSiteLayers() {
    const data = this.siteFeatures();
    this.map.addSource(this.markerSource, { type: 'geojson', data });
    this.map.addLayer({
      id: this.markerLayer, type: 'circle', source: this.markerSource, minzoom: 3.5,
      paint: {
        'circle-radius': ['case', ['boolean', ['get', 'active'], false], 7, 5],
        'circle-color': ['case', ['boolean', ['get', 'active'], false], '#ff2f9a', '#70b7d7'],
        'circle-stroke-color': '#06121b', 'circle-stroke-width': 2, 'circle-opacity': .95,
      },
    }, this.options.anchor);
    this.map.addLayer({
      id: this.markerLabelLayer, type: 'symbol', source: this.markerSource, minzoom: 5.5,
      layout: { 'text-field': ['get', 'shortId'], 'text-size': 10, 'text-offset': [0, 1.15], 'text-anchor': 'top', 'text-allow-overlap': false },
      paint: { 'text-color': '#e9f7ff', 'text-halo-color': '#07111a', 'text-halo-width': 1.5 },
    }, this.options.anchor);
    this.map.addSource(this.sweepSource, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    this.map.addLayer({ id: this.sweepFillLayer, type: 'fill', source: this.sweepSource, filter: ['==', ['get', 'kind'], 'wedge'], paint: { 'fill-color': '#67f4ff', 'fill-opacity': .10 } }, this.markerLayer);
    this.map.addLayer({ id: this.sweepLineLayer, type: 'line', source: this.sweepSource, filter: ['!=', ['get', 'kind'], 'wedge'], paint: { 'line-color': ['case', ['==', ['get', 'kind'], 'beam'], '#a9fbff', '#5ec8d8'], 'line-width': ['case', ['==', ['get', 'kind'], 'beam'], 2, 1], 'line-opacity': ['case', ['==', ['get', 'kind'], 'beam'], .82, .32] } }, this.markerLayer);
    this.clickHandler = (event: any) => {
      const features = this.map.queryRenderedFeatures(event.point, { layers: [this.markerLabelLayer, this.markerLayer] });
      const id = String(features?.[0]?.properties?.id ?? '');
      if (id) void this.toggleRadarSite(id);
    };
    this.map.on('click', this.clickHandler);
    this.updateSweepSource();
  }

  private siteFeatures() {
    return {
      type: 'FeatureCollection' as const,
      features: this.sites.map(site => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [site.lng, site.lat] }, properties: { ...site, shortId: radarShortId(site.id), active: this.activeIds.includes(site.id) } })),
    };
  }

  private refreshMarkerState() {
    const source = this.map.getSource(this.markerSource) as any;
    source?.setData(this.siteFeatures());
    this.updateSweepSource(); this.emit();
  }

  private destination(lng: number, lat: number, bearing: number, km: number): [number, number] {
    const r = 6371, d = km / r, br = bearing * Math.PI / 180, p1 = lat * Math.PI / 180, l1 = lng * Math.PI / 180;
    const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(br));
    const l2 = l1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return [l2 * 180 / Math.PI, p2 * 180 / Math.PI];
  }

  private updateSweepSource() {
    const features: any[] = [];
    for (const id of this.activeIds) {
      const site = this.sites.find(s => s.id === id); if (!site) continue;
      const ring: [number, number][] = [];
      for (let b = 0; b <= 360; b += 6) ring.push(this.destination(site.lng, site.lat, b, 230));
      const left = this.destination(site.lng, site.lat, this.sweepAngle - 4, 230), right = this.destination(site.lng, site.lat, this.sweepAngle + 4, 230), tip = this.destination(site.lng, site.lat, this.sweepAngle, 230);
      features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: ring }, properties: { kind: 'ring', id } });
      features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[site.lng, site.lat], tip] }, properties: { kind: 'beam', id } });
      features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[site.lng, site.lat], left, tip, right, [site.lng, site.lat]]] }, properties: { kind: 'wedge', id } });
    }
    (this.map.getSource(this.sweepSource) as any)?.setData({ type: 'FeatureCollection', features });
  }

  private startSweep() {
    this.sweepTimer = setInterval(() => { this.sweepAngle = (this.sweepAngle + 3) % 360; this.updateSweepSource(); }, 75);
  }

  private move = () => {
    if (this.moveTimer) clearTimeout(this.moveTimer);
    this.moveTimer = setTimeout(() => {
      for (const id of this.activeIds) {
        const selected = this.runtimes.get(id)?.selected;
        if (selected !== null && selected !== undefined) void this.loadSite(id, selected).catch(error => this.options.onError(error instanceof Error ? error.message : 'NWS radar image failed'));
      }
    }, 350);
  };

  async refreshData() {
    await this.mosaic?.refreshData().catch(error => this.options.onNotice?.(`MRMS backup unavailable: ${error instanceof Error ? error.message : String(error)}`));
    const failures: string[] = [];
    await Promise.all(this.activeIds.map(async id => {
      try {
        const response = await request(radarCapabilities(id), this.lifetime.signal);
        const capabilities = await response.text(), layer = radarReflectivityLayer(capabilities, id);
        const times = publishedTimes(capabilities, layer);
        const runtime = this.runtimes.get(id) ?? { layer, times: [], selected: null, activeLayer: null, serial: 0 };
        runtime.layer = layer; runtime.times = times; this.runtimes.set(id, runtime);
        await this.loadSite(id, times[times.length - 1]);
      } catch (error) { failures.push(`${radarShortId(id)}: ${error instanceof Error ? error.message : String(error)}`); }
    }));
    const primarySelected = this.activeIds[0] ? this.runtimes.get(this.activeIds[0])?.selected : null;
    if (this.mosaic && primarySelected !== null && primarySelected !== undefined) {
      await this.mosaic.setMRMSTimestamp(primarySelected / 1000).catch(error => this.options.onNotice?.(`MRMS backup: ${error instanceof Error ? error.message : String(error)}`));
    }
    this.emit();
    if (this.activeIds.length && failures.length === this.activeIds.length) throw Error(`NWS WSR-88D unavailable (${failures.join('; ')})`);
    if (failures.length) this.options.onNotice?.(`Some selected radars are unavailable: ${failures.join('; ')}`);
  }

  private nearestTime(id: string, requested: number): number | null {
    const times = this.runtimes.get(id)?.times ?? [];
    if (!times.length) return null;
    return times.reduce((best, value) => Math.abs(value - requested) < Math.abs(best - requested) ? value : best, times[0]);
  }

  async setMRMSTimestamp(timeSeconds: number) {
    const requested = timeSeconds * 1000;
    const siteLoads = this.activeIds.map(async id => { const time = this.nearestTime(id, requested); if (time !== null) await this.loadSite(id, time); });
    const mosaicLoad = this.mosaic
      ? this.mosaic.setMRMSTimestamp(timeSeconds).catch(error => this.options.onNotice?.(`MRMS backup: ${error instanceof Error ? error.message : String(error)}`))
      : Promise.resolve();
    await Promise.all([...siteLoads, mosaicLoad]);
  }
  async setSatelliteTimestamp(_timeSeconds: number) { }
  async setUnits(_units: string) { }
  async setOpacity(value: number) {
    this.opacity = value;
    for (const runtime of this.runtimes.values()) if (runtime.activeLayer && this.map.getLayer(runtime.activeLayer)) this.map.setPaintProperty(runtime.activeLayer, 'raster-opacity', value);
    await this.mosaic?.setOpacity(Math.min(value, .48));
  }

  async setPrimaryRadar(id: string) {
    if (!id) { await this.applyRadarSelection([]); return; }
    if (!this.sites.some(site => site.id === id)) return;
    const next = [id, ...this.activeIds.filter(value => value !== id)].slice(0, 3);
    await this.applyRadarSelection(next);
  }

  async toggleRadarSite(id: string) {
    if (!this.sites.some(site => site.id === id)) return;
    if (this.activeIds.includes(id)) { await this.applyRadarSelection(this.activeIds.filter(value => value !== id)); return; }
    if (this.activeIds.length >= 3) { this.options.onNotice?.('Maximum of three active radar sweeps. Turn one off before adding another.'); return; }
    await this.applyRadarSelection([...this.activeIds, id]);
  }

  private async applyRadarSelection(next: string[]) {
    const removed = this.activeIds.filter(id => !next.includes(id));
    for (const id of removed) {
      this.siteFrames.get(id)?.abort(); this.siteFrames.delete(id);
      const runtime = this.runtimes.get(id); if (runtime?.activeLayer) this.remove(runtime.activeLayer);
      this.runtimes.delete(id); this.paletteFallbackSites.delete(id);
    }
    this.activeIds = [...new Set(next)].slice(0, 3);
    this.currentLoadedTimeKey = this.activeIds[0] ? (this.runtimes.get(this.activeIds[0])?.selected ?? null) : null;
    this.refreshMarkerState();
    for (const id of this.activeIds) {
      if (this.runtimes.has(id)) continue;
      try {
        const response = await request(radarCapabilities(id), this.lifetime.signal), capabilities = await response.text();
        const layer = radarReflectivityLayer(capabilities, id), times = publishedTimes(capabilities, layer);
        this.runtimes.set(id, { layer, times, selected: null, activeLayer: null, serial: 0 });
        await this.loadSite(id, times[times.length - 1]);
      } catch (error) { this.options.onError(`${radarShortId(id)} radar: ${error instanceof Error ? error.message : String(error)}`); }
    }
    this.currentLoadedTimeKey = this.activeIds[0] ? (this.runtimes.get(this.activeIds[0])?.selected ?? null) : null;
    this.emit();
  }

  private remove(id: string) { if (this.map.getLayer(id)) this.map.removeLayer(id); if (this.map.getSource(id)) this.map.removeSource(id); this.owned.delete(id); }

  private async radarResponse(siteId: string, layer: string, time: number, view: ReturnType<typeof viewportRequest>, signal: AbortSignal): Promise<Response> {
    try {
      const styled = await request(radarImageRequest(siteId, layer, time, view.mercator, view.width, view.height, true), signal);
      if (styled.headers.get('content-type')?.toLowerCase().includes('image/png')) {
        const changed = this.paletteFallbackSites.delete(siteId);
        if (changed) this.emit();
        return styled;
      }
    } catch (error) {
      if (signal.aborted) throw error;
    }
    const changed = !this.paletteFallbackSites.has(siteId);
    this.paletteFallbackSites.add(siteId);
    if (changed) this.emit();
    this.options.onNotice?.(`${radarShortId(siteId)} rejected the custom palette request; using the NWS service style for this frame.`);
    return request(radarImageRequest(siteId, layer, time, view.mercator, view.width, view.height, false), signal);
  }

  private async loadSite(siteId: string, time: number) {
    const runtime = this.runtimes.get(siteId); if (!runtime || this.lifetime.signal.aborted || !runtime.times.includes(time)) return;
    this.siteFrames.get(siteId)?.abort(); const frame = new AbortController(); this.siteFrames.set(siteId, frame);
    const signal = AbortSignal.any([frame.signal, this.lifetime.signal]); const serial = ++runtime.serial; runtime.selected = time; this.emit();
    const view = viewportRequest(this.map); let id: string | null = null;
    try {
      let response = await this.radarResponse(siteId, runtime.layer, time, view, signal);
      if (!response.headers.get('content-type')?.toLowerCase().includes('image/png')) throw Error(`${radarShortId(siteId)} returned a service error instead of radar imagery`);
      const blob = await response.blob(); if (blob.size < 8) throw Error(`${radarShortId(siteId)} returned an empty radar image`);
      const url = await dataURL(blob); if (signal.aborted || serial !== runtime.serial) return;
      id = `${this.prefix}-${siteId.toLowerCase()}-${serial}`; const next = id; this.owned.add(next);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => finish(Error(`${radarShortId(siteId)} radar image could not be drawn within 20 seconds`)), 20000);
        const cleanup = () => { clearTimeout(timer); this.map.off('sourcedata', loaded); signal.removeEventListener('abort', cancel); };
        const finish = (error?: Error) => { cleanup(); error ? reject(error) : resolve(); };
        const loaded = (event: { sourceId?: string; isSourceLoaded?: boolean }) => { if (event.sourceId === next && event.isSourceLoaded) finish(); };
        const cancel = () => finish(new DOMException('Cancelled', 'AbortError'));
        this.map.on('sourcedata', loaded); signal.addEventListener('abort', cancel, { once: true });
        try {
          this.map.addSource(next, { type: 'image', url, coordinates: [[view.geographic[0], view.geographic[1]], [view.geographic[2], view.geographic[1]], [view.geographic[2], view.geographic[3]], [view.geographic[0], view.geographic[3]]] });
          this.map.addLayer({ id: next, type: 'raster', source: next, paint: { 'raster-opacity': 0, 'raster-fade-duration': 0 } }, this.map.getLayer(this.sweepFillLayer) ? this.sweepFillLayer : this.map.getLayer(this.markerLayer) ? this.markerLayer : this.options.anchor);
        } catch (error) { finish(error instanceof Error ? error : Error(`Could not add ${radarShortId(siteId)} radar imagery`)); }
      });
      if (signal.aborted || serial !== runtime.serial) return;
      const old = runtime.activeLayer; runtime.activeLayer = next; this.map.setPaintProperty(next, 'raster-opacity', this.opacity); if (old) this.remove(old);
      await new Promise<void>(resolve => { const done = () => { this.map.off('render', done); signal.removeEventListener('abort', done); resolve(); }; this.map.once('render', done); signal.addEventListener('abort', done, { once: true }); this.map.triggerRepaint(); });
      if (!signal.aborted && serial === runtime.serial) {
        if (siteId === this.activeIds[0]) this.currentLoadedTimeKey = time;
        this.emit();
      }
    } catch (error) { if (!signal.aborted) throw error; }
    finally { if (id && id !== runtime.activeLayer) this.remove(id); }
  }

  get loading() { return [...this.siteFrames.values()].some(controller => !controller.signal.aborted) && this.currentLoadedTimeKey === null; }

  destroy() {
    this.lifetime.abort(); for (const controller of this.siteFrames.values()) controller.abort();
    if (this.moveTimer) clearTimeout(this.moveTimer); if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.map.off('moveend', this.move); this.map.off('resize', this.move);
    if (this.clickHandler) { this.map.off('click', this.clickHandler); this.clickHandler = null; }
    this.mosaic?.destroy(); this.mosaic = null;
    for (const id of [...this.owned]) this.remove(id);
    for (const id of [this.sweepFillLayer, this.sweepLineLayer, this.markerLabelLayer, this.markerLayer]) if (this.map.getLayer(id)) this.map.removeLayer(id);
    for (const id of [this.sweepSource, this.markerSource]) if (this.map.getSource(id)) this.map.removeSource(id);
    this.listener = null;
  }
}
