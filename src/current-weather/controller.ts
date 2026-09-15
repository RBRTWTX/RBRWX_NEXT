import type { GeoJSONSource, Map as WeatherMap } from 'maplibre-gl';
import palettes from './palettes.json';
import { PublicImagery, RadarImagery, type PublicImageryOptions } from './public-imagery';
import { defaultOptions, frameTimes, freshness, initialSnapshot, nextFrame, temperatureLabel, type Observation, type Options, type Product, type RadarSite, type Snapshot } from './model';
import { ObservationsClient } from './observations';

const observationSourceId = 'rbrwx-current-observations';
const observationLayerId = 'rbrwx-current-observation-labels';
const temperatureFieldSourceId = 'rbrwx-current-temperature-field';
const temperatureFieldLayerId = 'rbrwx-current-temperature-field-fill';

type ManagerState = Record<string, unknown>;
interface WeatherManager {
  currentLoadedTimeKey: number | null;
  on(event: string, listener: (state: ManagerState) => void): void;
  initialize(): Promise<void>;
  refreshData(): Promise<void>;
  setOpacity(value: number): Promise<void>;
  setUnits(units: string): Promise<void>;
  setMRMSTimestamp(time: number): Promise<void>;
  setMRMSEnabled?(enabled: boolean): Promise<void>;
  setSweepsEnabled?(enabled: boolean): Promise<void>;
  setSatelliteTimestamp(time: number): Promise<void>;
  setPrimaryRadar?(id: string): Promise<void>;
  toggleRadarSite?(id: string): Promise<void>;
  destroy(): void;
}

interface ManagerOptions extends PublicImageryOptions { mrmsEnabled?: boolean; sweepsEnabled?: boolean; onNotice?: (message: string) => void }
export type ManagerFactory = (map: WeatherMap, options: ManagerOptions) => Promise<WeatherManager>;
const loadManager: ManagerFactory = async (map, options) => options.product === 'radar'
  ? new RadarImagery(map, { ...options, product: 'radar', mrmsEnabled: options.mrmsEnabled, onNotice: options.onNotice })
  : new PublicImagery(map, options);

interface TemperaturePaletteBin { label: string; value?: string | number; rgba: number[] }
interface TemperaturePalette { id: string; bins: TemperaturePaletteBin[] }
type Rgba = [number, number, number, number];
type ImageCoordinates = [[number, number], [number, number], [number, number], [number, number]];
interface TemperatureFieldImage { url: string; coordinates: ImageCoordinates }

const temperaturePalette = ((palettes as unknown as { keys: TemperaturePalette[] }).keys ?? []).find(key => key.id === 'nws.ndfd.temperature');

function temperatureStopValue(bin: TemperaturePaletteBin): number | null {
  const explicit = Number(bin.value);
  if (Number.isFinite(explicit)) return explicit;
  const values = (bin.label.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).filter(Number.isFinite);
  if (!values.length) return null;
  if (values.length >= 2) return (Math.min(values[0], values[1]) + Math.max(values[0], values[1])) / 2;
  return values[0];
}

const temperatureStops = (() => {
  const unique = new Map<number, Rgba>();
  for (const bin of temperaturePalette?.bins ?? []) {
    const value = temperatureStopValue(bin); if (value === null) continue;
    const [r = 0, g = 0, b = 0, a = 255] = bin.rgba;
    unique.set(value, [r, g, b, a]);
  }
  return [...unique.entries()].map(([value, rgba]) => ({ value, rgba })).sort((a, b) => a.value - b.value);
})();

function temperatureRgba(fahrenheit: number): Rgba {
  if (!temperatureStops.length) return [68, 124, 178, 255];
  if (fahrenheit <= temperatureStops[0].value) return temperatureStops[0].rgba;
  for (let i = 1; i < temperatureStops.length; i++) {
    const lower = temperatureStops[i - 1], upper = temperatureStops[i];
    if (fahrenheit > upper.value) continue;
    const span = upper.value - lower.value;
    const t = span > 0 ? Math.max(0, Math.min(1, (fahrenheit - lower.value) / span)) : 1;
    return lower.rgba.map((value, index) => Math.round(value + (upper.rgba[index] - value) * t)) as Rgba;
  }
  return temperatureStops[temperatureStops.length - 1].rgba;
}

const transparentPixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function transparentTemperatureField(): TemperatureFieldImage {
  return { url: transparentPixel, coordinates: [[-180, 85], [180, 85], [180, -85], [-180, -85]] };
}

function buildTemperatureFieldImage(map: WeatherMap, observations: Observation[]): TemperatureFieldImage | null {
  const valid = observations.filter((o): o is Observation & { temperature: number } => o.temperature !== null);
  if (valid.length < 2 || map.getZoom() < 4 || typeof document === 'undefined') return null;

  const bounds = map.getBounds(), west = bounds.getWest(), east = bounds.getEast(), south = bounds.getSouth(), north = bounds.getNorth();
  if (!(west < east && south < north)) return null;

  const mapCanvas = map.getCanvas();
  const displayWidth = Math.max(1, mapCanvas.clientWidth || mapCanvas.width || 1280);
  const displayHeight = Math.max(1, mapCanvas.clientHeight || mapCanvas.height || 720);
  const width = Math.max(128, Math.min(256, Math.round(112 + map.getZoom() * 12)));
  const height = Math.max(72, Math.min(192, Math.round(width * displayHeight / displayWidth)));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d'); if (!context) return null;
  const image = context.createImageData(width, height);

  const lonSpan = east - west, latSpan = north - south;
  const maxDistance = Math.max(lonSpan * .45, latSpan * .65, .55);
  for (let y = 0; y < height; y++) {
    const lat = north - (y + .5) / height * latSpan;
    const cos = Math.cos(lat * Math.PI / 180);
    for (let x = 0; x < width; x++) {
      const lng = west + (x + .5) / width * lonSpan;
      let weighted = 0, weights = 0, nearest = Infinity;
      for (const observation of valid) {
        const distance = Math.hypot((observation.lng - lng) * cos, observation.lat - lat);
        nearest = Math.min(nearest, distance);
        if (distance > maxDistance) continue;
        const weight = 1 / Math.pow(Math.max(.015, distance), 1.7);
        weighted += (observation.temperature * 9 / 5 + 32) * weight;
        weights += weight;
      }
      const offset = (y * width + x) * 4;
      if (!weights || nearest > maxDistance) {
        image.data[offset + 3] = 0;
        continue;
      }
      const rgba = temperatureRgba(weighted / weights);
      image.data[offset] = rgba[0];
      image.data[offset + 1] = rgba[1];
      image.data[offset + 2] = rgba[2];
      image.data[offset + 3] = rgba[3];
    }
  }

  context.putImageData(image, 0, 0);
  return {
    url: canvas.toDataURL('image/png'),
    coordinates: [[west, north], [east, north], [east, south], [west, south]],
  };
}

function emptyFeatureCollection() { return { type: 'FeatureCollection' as const, features: [] as any[] }; }

export class CurrentWeatherController {
  private map: WeatherMap | null = null;
  private manager: WeatherManager | null = null;
  private generation = 0;
  private abort: AbortController | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private moveTimer: ReturnType<typeof setTimeout> | null = null;
  private playTimer: ReturnType<typeof setInterval> | null = null;
  private scene = '';
  private product: Product = 'map';
  private options = defaultOptions();
  private apiKey = '';
  private anchor = '';
  private requested: number | null = null;
  private loadStarted = 0;
  private received = 0;
  private networkFailed = false;
  private refreshing = false;
  private paletteFallback = false;
  private observations = new ObservationsClient();
  snapshot = initialSnapshot();

  constructor(private notify: (snapshot: Snapshot) => void, private factory = loadManager) { }
  private emit(patch: Partial<Snapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.notify(this.snapshot); }
  connect(map: WeatherMap, anchor: string): () => void { this.map = map; this.anchor = anchor; void this.start(); return () => { this.clear(); this.map = null; }; }

  select(scene: string, product: Product, options: Options, apiKey: string) {
    const previousMrmsEnabled = this.options.mrmsEnabled;
    const previousSweepsEnabled = this.options.sweepsEnabled;
    const reload = scene !== this.scene || product !== this.product || apiKey !== this.apiKey;
    this.scene = scene; this.product = product; this.options = options; this.apiKey = apiKey;
    if (reload) void this.start();
    else {
      void this.manager?.setOpacity(options.opacity).catch(() => this.emit({ status: 'unavailable', message: 'Unable to update imagery opacity' }));
      void this.manager?.setUnits(options.units).catch(() => this.emit({ status: 'unavailable', message: 'Unable to update weather units' }));
      if (options.mrmsEnabled !== previousMrmsEnabled && this.product === 'radar') {
        void this.manager?.setMRMSEnabled?.(options.mrmsEnabled).catch(() => this.emit({ message: 'Unable to update the MRMS backup layer' }));
      }
      if (options.sweepsEnabled !== previousSweepsEnabled && this.product === 'radar') {
        void this.manager?.setSweepsEnabled?.(options.sweepsEnabled).catch(() => this.emit({ message: 'Unable to update radar sweep animation' }));
      }
      this.drawObservations();
    }
  }

  private clear() {
    this.generation++; this.abort?.abort(); this.abort = null; this.stop();
    if (this.interval) clearInterval(this.interval); if (this.refreshInterval) clearInterval(this.refreshInterval); if (this.moveTimer) clearTimeout(this.moveTimer);
    this.interval = null; this.refreshInterval = null; this.moveTimer = null;
    this.map?.off('moveend', this.move);
    this.manager?.destroy(); this.manager = null;
    for (const id of [observationLayerId, temperatureFieldLayerId]) if (this.map?.getLayer(id)) this.map.removeLayer(id);
    for (const id of [observationSourceId, temperatureFieldSourceId]) if (this.map?.getSource(id)) this.map.removeSource(id);
    this.requested = null; this.received = 0; this.networkFailed = false; this.refreshing = false; this.paletteFallback = false;
  }

  destroy() { this.clear(); this.map = null; }

  private async start() {
    this.clear(); const generation = this.generation, map = this.map;
    this.emit(initialSnapshot()); if (this.product === 'map') return;
    if (!map) { this.emit({ status: 'loading', message: 'Waiting for geographic map' }); return; }

    if (this.product === 'observations') {
      const initialField = transparentTemperatureField();
      map.addSource(temperatureFieldSourceId, { type: 'image', url: initialField.url, coordinates: initialField.coordinates });
      map.addLayer({ id: temperatureFieldLayerId, type: 'raster', source: temperatureFieldSourceId, paint: { 'raster-opacity': Math.min(.68, this.options.opacity * .72), 'raster-fade-duration': 0, 'raster-resampling': 'linear' } }, this.anchor);
      map.addSource(observationSourceId, { type: 'geojson', data: emptyFeatureCollection(), attribution: 'NOAA / National Weather Service observations' });
      map.addLayer({
        id: observationLayerId, type: 'symbol', source: observationSourceId,
        layout: {
          'text-field': ['get', 'label'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 4, 11, 7, 14, 10, 17, 13, 19],
          'text-font': ['Noto Sans Bold'], 'text-anchor': 'center', 'text-allow-overlap': false, 'text-ignore-placement': false,
        },
        paint: { 'text-color': '#ffffff', 'text-halo-color': '#07111a', 'text-halo-width': 2.2, 'text-opacity': this.options.opacity },
      }, this.anchor);
      map.on('moveend', this.move); await this.loadObservations(generation);
      if (generation !== this.generation) return;
      this.refreshInterval = setInterval(() => void this.loadObservations(generation), 300000);
      this.interval = setInterval(() => this.drawObservations(), 15000); return;
    }

    this.emit({ status: 'loading', message: this.product === 'radar' ? 'Loading NWS WSR-88D radar…' : 'Loading public NOAA imagery…' }); this.loadStarted = Date.now();
    let manager: WeatherManager | null = null;
    try {
      manager = await this.factory(map, {
        product: this.product, anchor: this.anchor, opacity: this.options.opacity, mrmsEnabled: this.options.mrmsEnabled, sweepsEnabled: this.options.sweepsEnabled,
        onError: message => { if (generation === this.generation) { this.networkFailed = true; this.emit({ status: 'unavailable', message }); } },
        onNotice: message => { if (generation === this.generation) this.emit({ message }); },
      });
      if (generation !== this.generation) { manager.destroy(); return; } this.manager = manager;
      manager.on('state:change', state => {
        if (generation !== this.generation) return;
        const times = frameTimes(state.availableTimestamps), raw = state.mrmsTimestamp;
        this.requested = frameTimes([raw])[0] ?? null;
        const radarSites = Array.isArray(state.radarSites) ? state.radarSites as RadarSite[] : this.snapshot.radarSites;
        const activeRadarIds = Array.isArray(state.activeRadarIds) ? state.activeRadarIds.filter((id): id is string => typeof id === 'string') : this.snapshot.activeRadarIds;
        const primaryRadarId = typeof state.primaryRadarId === 'string' ? state.primaryRadarId : activeRadarIds[0] ?? null;
        this.paletteFallback = state.paletteFallback === true;
        this.emit({ times, selectedTime: this.requested, radarSites, activeRadarIds, primaryRadarId });
      });
      this.interval = setInterval(() => this.pollFrame(), 500);
      await manager.initialize(); if (generation !== this.generation) return;
      this.received = Date.now(); this.refreshInterval = setInterval(() => void this.refresh(), 120000);
    } catch (error) {
      if (this.manager === manager && manager) {
        manager.destroy(); this.manager = null;
        if (this.interval) clearInterval(this.interval); this.interval = null;
      }
      if (generation === this.generation) { this.networkFailed = true; this.emit({ status: 'unavailable', message: `Public NOAA imagery: ${error instanceof Error ? error.message : 'request failed'}. Refresh to retry.` }); }
    }
  }

  private pollFrame() {
    const manager = this.manager; if (!manager) return;
    const time = frameTimes([manager.currentLoadedTimeKey])[0] ?? null;
    if (time !== null) {
      const status = freshness(time, this.product === 'radar' ? 15 : 30, this.networkFailed || Date.now() - this.received > 180000);
      let label = 'NOAA GOES East/West infrared · Band 14';
      if (this.product === 'radar') {
        const id = this.snapshot.primaryRadarId ?? 'KEWX', shortId = id.startsWith('K') ? id.slice(1) : id;
        label = `${shortId} WSR-88D · SR_BREF · ${this.paletteFallback ? 'NWS palette fallback' : 'RadarScope palette'}`;
      }
      this.emit({ time, status, message: `${label} · ${status.toUpperCase()} · ${new Date(time).toLocaleString()}` });
    } else if (this.product === 'radar' && !this.snapshot.activeRadarIds.length) {
      this.emit({ time: null, status: 'off', message: this.options.mrmsEnabled ? 'No site radar selected · MRMS backup mosaic active' : 'No radar site selected · click a radar tower or choose one from the menu' });
    } else if (Date.now() - this.loadStarted > 60000) this.emit({ time: null, status: 'unavailable', message: 'No NOAA imagery loaded. Check the connection, then Refresh.' });
  }

  private move = () => { if (this.moveTimer) clearTimeout(this.moveTimer); this.moveTimer = setTimeout(() => void this.loadObservations(this.generation), 650); };

  private async loadObservations(generation: number) {
    const map = this.map; if (!map) return; this.abort?.abort(); const abort = new AbortController(); this.abort = abort;
    const bounds = map.getBounds(); this.emit({ status: 'loading', message: 'Updating visible NWS temperatures…', time: null });
    try {
      const observations = await this.observations.loadViewport({ west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth(), zoom: map.getZoom() }, abort.signal);
      if (generation !== this.generation || abort.signal.aborted) return;
      this.emit({ observations }); this.drawObservations();
    } catch (error) {
      if (generation === this.generation && !abort.signal.aborted) this.emit({ status: 'unavailable', message: `NWS observations: ${error instanceof Error ? error.message : 'request failed'}. Refresh to retry.` });
    }
  }

  private drawObservations() {
    if (this.product !== 'observations' || !this.map) return; const observations = this.snapshot.observations;
    const features = observations.flatMap(o => {
      const label = temperatureLabel(o.temperature, this.options.units); if (!label) return [];
      return [{ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [o.lng, o.lat] }, properties: { label } }];
    });
    (this.map.getSource(observationSourceId) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
    const field = buildTemperatureFieldImage(this.map, observations) ?? transparentTemperatureField();
    const fieldSource = this.map.getSource(temperatureFieldSourceId) as any;
    if (typeof fieldSource?.updateImage === 'function') fieldSource.updateImage(field);
    if (this.map.getLayer(observationLayerId)) this.map.setPaintProperty(observationLayerId, 'text-opacity', this.options.opacity);
    if (this.map.getLayer(temperatureFieldLayerId)) this.map.setPaintProperty(temperatureFieldLayerId, 'raster-opacity', Math.min(.68, this.options.opacity * .72));
    if (observations.length) {
      const states = observations.map(o => freshness(o.time, 90, o.cached));
      const status = states.includes('unavailable') ? 'unavailable' : states.includes('stale') ? 'stale' : states.includes('cached') ? 'cached' : 'fresh';
      this.emit({ status, time: Math.min(...observations.map(o => o.time)), message: `NWS observed temperatures · ${status.toUpperCase()} · ${observations.length} stations sampled for this viewport` });
    }
  }

  async refresh() {
    if (this.refreshing) return; this.refreshing = true; const generation = this.generation;
    try {
      if (this.product === 'observations') await this.loadObservations(generation);
      else if (this.manager) { await this.manager.refreshData(); if (generation === this.generation) { this.received = Date.now(); this.networkFailed = false; this.pollFrame(); } }
      else await this.start();
    } catch {
      if (generation === this.generation) { this.networkFailed = true; this.emit({ status: this.snapshot.time ? freshness(this.snapshot.time, this.product === 'radar' ? 15 : 30, true) : 'unavailable', message: 'Refresh failed. Any displayed frame retains its original timestamp.' }); }
    } finally { if (generation === this.generation) this.refreshing = false; }
  }

  async setPrimaryRadar(id: string) {
    if (this.product !== 'radar' || !this.manager?.setPrimaryRadar) return;
    await this.manager.setPrimaryRadar(id);
  }

  async toggleRadarSite(id: string) {
    if (this.product !== 'radar' || !this.manager?.toggleRadarSite) return;
    await this.manager.toggleRadarSite(id);
  }

  async seek(time: number) {
    if (!this.manager || !this.snapshot.times.includes(time)) return;
    try {
      this.requested = time; this.loadStarted = Date.now();
      await (this.product === 'radar' ? this.manager.setMRMSTimestamp(time / 1000) : this.manager.setSatelliteTimestamp(time / 1000));
    } catch { this.stop(); this.emit({ message: 'Could not load the selected frame. Displayed timestamp is unchanged.' }); }
  }

  step(direction: 1 | -1) { this.stop(); const next = nextFrame(this.snapshot.times, this.snapshot.selectedTime, direction, this.options.loop); if (next !== null) void this.seek(next); }
  stop() { if (this.playTimer) clearInterval(this.playTimer); this.playTimer = null; if (this.snapshot.playing) this.emit({ playing: false }); }
  play() {
    if (this.snapshot.playing) { this.stop(); return; } if (this.snapshot.times.length < 2) return;
    this.emit({ playing: true }); this.playTimer = setInterval(() => {
      if (this.snapshot.time !== this.snapshot.selectedTime) return;
      const next = nextFrame(this.snapshot.times, this.snapshot.selectedTime, 1, this.options.loop);
      if (next === null) { this.stop(); return; } void this.seek(next);
    }, 800);
  }
}
