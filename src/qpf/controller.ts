import type { FeatureCollection, Geometry } from 'geojson';
import type { FillLayerSpecification, Map as MapLibreMap, GeoJSONSource } from 'maplibre-gl';
import { QPF_PRODUCTS, QPF_DEFAULT_OPACITY, initialQpfSnapshot, type QpfProduct, type QpfSnapshot } from './model';

const SERVICE_ROOT = 'https://mapservices.weather.noaa.gov/vector/rest/services/precip/wpc_qpf/MapServer';
const SOURCE_ID = 'rbrwx-qpf-source';
const FILL_LAYER_ID = 'rbrwx-qpf-fill';
const CACHE_MAX_AGE_MS = 5 * 60 * 1000;

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

interface QpfPayload {
  collection: FeatureCollection<Geometry, Record<string, unknown>>;
  issueTime: string | null;
  startTime: string | null;
  endTime: string | null;
  validTime: string | null;
  fetchedAt: number;
}

const cache = new Map<QpfProduct, QpfPayload>();

const WPC_QPF_FILL_COLOR: FillLayerSpecification['paint'] = {
  'fill-color': [
    'match', ['to-number', ['get', 'qpf']],
    0.01, '#7fff00',
    0.1, '#00ff00',
    0.25, '#088b00',
    0.5, '#104e8b',
    0.75, '#1e90ff',
    1, '#00b2ee',
    1.25, '#00eeee',
    1.5, '#8968cd',
    1.75, '#912cee',
    2, '#8b008b',
    2.5, '#8b0000',
    3, '#ff0000',
    4, '#ee4000',
    5, '#ff7f00',
    7, '#ce8500',
    10, '#ffd700',
    15, '#ffff00',
    20, '#ffc0b7',
    'rgba(0,0,0,0)',
  ],
  'fill-opacity': QPF_DEFAULT_OPACITY,
  'fill-antialias': true,
};

function stringProperty(properties: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = properties?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function fetchQpf(product: QpfProduct, force: boolean, signal: AbortSignal): Promise<QpfPayload> {
  const cached = cache.get(product);
  if (!force && cached && Date.now() - cached.fetchedAt < CACHE_MAX_AGE_MS) return cached;

  const definition = QPF_PRODUCTS[product];
  const params = new URLSearchParams({
    where: 'qpf > 0',
    outFields: 'product,valid_time,qpf,units,issue_time,start_time,end_time',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
  });
  const response = await fetch(`${SERVICE_ROOT}/${definition.layerId}/query?${params.toString()}`, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error(`WPC QPF request failed (${response.status})`);
  const raw: unknown = await response.json();
  if (!raw || typeof raw !== 'object' || (raw as { type?: unknown }).type !== 'FeatureCollection' || !Array.isArray((raw as { features?: unknown }).features)) {
    throw new Error('WPC QPF response was not a GeoJSON FeatureCollection');
  }
  const collection = raw as FeatureCollection<Geometry, Record<string, unknown>> & { exceededTransferLimit?: boolean };
  if (collection.exceededTransferLimit) throw new Error('WPC QPF response exceeded the service transfer limit');
  const first = collection.features[0]?.properties ?? null;
  const payload: QpfPayload = {
    collection,
    issueTime: stringProperty(first, 'issue_time'),
    startTime: stringProperty(first, 'start_time'),
    endTime: stringProperty(first, 'end_time'),
    validTime: stringProperty(first, 'valid_time'),
    fetchedAt: Date.now(),
  };
  cache.set(product, payload);
  return payload;
}

export class QpfController {
  private map: MapLibreMap | null = null;
  private beforeId: string | undefined;
  private product: QpfProduct | null = null;
  private opacity = QPF_DEFAULT_OPACITY;
  private abort: AbortController | null = null;
  private generation = 0;
  private snapshot: QpfSnapshot = initialQpfSnapshot;

  constructor(private readonly onSnapshot: (snapshot: QpfSnapshot) => void) {}

  connect(map: MapLibreMap, beforeId?: string): () => void {
    this.map = map;
    this.beforeId = beforeId;
    this.ensureLayer();
    if (this.product) void this.load(false);
    return () => {
      if (this.map !== map) return;
      this.abort?.abort();
      this.abort = null;
      if (map.getLayer(FILL_LAYER_ID)) map.removeLayer(FILL_LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      this.map = null;
    };
  }

  select(product: QpfProduct | null, opacity = QPF_DEFAULT_OPACITY): void {
    const changed = this.product !== product;
    this.product = product;
    this.opacity = Math.max(0, Math.min(1, opacity));
    this.ensureLayer();
    this.applyOpacity();
    if (!product) {
      this.abort?.abort();
      this.abort = null;
      this.clearSource();
      this.emit({ ...initialQpfSnapshot, opacity: this.opacity });
      return;
    }
    this.emit({
      ...this.snapshot,
      active: true,
      product,
      opacity: this.opacity,
      message: changed ? `Loading ${QPF_PRODUCTS[product].title}…` : this.snapshot.message,
    });
    if (changed) void this.load(false);
  }

  setOpacity(opacity: number): void {
    this.opacity = Math.max(0, Math.min(1, opacity));
    this.applyOpacity();
    this.emit({ ...this.snapshot, opacity: this.opacity });
  }

  refresh(): Promise<void> {
    return this.product ? this.load(true) : Promise.resolve();
  }

  destroy(): void {
    this.abort?.abort();
    this.abort = null;
    const map = this.map;
    if (map) {
      if (map.getLayer(FILL_LAYER_ID)) map.removeLayer(FILL_LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    }
    this.map = null;
    this.product = null;
  }

  private emit(next: QpfSnapshot): void {
    this.snapshot = next;
    this.onSnapshot(next);
  }

  private ensureLayer(): void {
    const map = this.map;
    if (!map || !map.isStyleLoaded()) return;
    if (!map.getSource(SOURCE_ID)) map.addSource(SOURCE_ID, { type: 'geojson', data: EMPTY });
    if (!map.getLayer(FILL_LAYER_ID)) {
      const before = this.beforeId && map.getLayer(this.beforeId) ? this.beforeId : undefined;
      map.addLayer({ id: FILL_LAYER_ID, type: 'fill', source: SOURCE_ID, paint: WPC_QPF_FILL_COLOR } as FillLayerSpecification, before);
    }
    this.applyOpacity();
  }

  private applyOpacity(): void {
    const map = this.map;
    if (map?.getLayer(FILL_LAYER_ID)) map.setPaintProperty(FILL_LAYER_ID, 'fill-opacity', this.opacity);
  }

  private clearSource(): void {
    const source = this.map?.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(EMPTY);
  }

  private async load(force: boolean): Promise<void> {
    const product = this.product;
    if (!product) return;
    const generation = ++this.generation;
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    this.emit({ ...this.snapshot, active: true, product, opacity: this.opacity, message: `Loading ${QPF_PRODUCTS[product].title}…` });
    try {
      const payload = await fetchQpf(product, force, abort.signal);
      if (abort.signal.aborted || generation !== this.generation || this.product !== product) return;
      this.ensureLayer();
      const source = this.map?.getSource(SOURCE_ID) as GeoJSONSource | undefined;
      source?.setData(payload.collection);
      this.emit({
        active: true,
        product,
        opacity: this.opacity,
        message: `${QPF_PRODUCTS[product].title} loaded`,
        issueTime: payload.issueTime,
        startTime: payload.startTime,
        endTime: payload.endTime,
        validTime: payload.validTime,
      });
    } catch (error) {
      if (abort.signal.aborted || generation !== this.generation || this.product !== product) return;
      this.clearSource();
      this.emit({
        active: true,
        product,
        opacity: this.opacity,
        message: error instanceof Error ? error.message : String(error),
        issueTime: null,
        startTime: null,
        endTime: null,
        validTime: null,
      });
    }
  }
}
