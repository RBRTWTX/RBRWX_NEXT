import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';
import type { LngLatBounds } from 'maplibre-gl';
import { BROADCAST_PROVIDERS } from './broadcastMapContract';

export interface CensusCountyProperties {
  GEOID?: string;
  BASENAME?: string;
  NAME?: string;
  INTPTLAT?: string;
  INTPTLON?: string;
}

type CensusCountyPolygon = Feature<Polygon | MultiPolygon, CensusCountyProperties>;
type CensusCountyLabel = Feature<Point, CensusCountyProperties>;

export interface CensusCountyData {
  boundaries: FeatureCollection<Polygon | MultiPolygon, CensusCountyProperties>;
  labels: FeatureCollection<Point, CensusCountyProperties>;
}

export const EMPTY_CENSUS_COUNTY_DATA: CensusCountyData = {
  boundaries: { type: 'FeatureCollection', features: [] },
  labels: { type: 'FeatureCollection', features: [] },
};

const COUNTY_MIN_ZOOM = 5.8;
const MAX_QUERY_SPAN_DEGREES = 40;

type Envelope = readonly [west: number, south: number, east: number, north: number];

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isCountyPolygon(value: unknown): value is CensusCountyPolygon {
  if (!value || typeof value !== 'object') return false;
  const feature = value as Partial<CensusCountyPolygon>;
  if (feature.type !== 'Feature' || !feature.geometry || !feature.properties) return false;
  return feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon';
}

function interiorPoint(properties: CensusCountyProperties): [number, number] | null {
  const lat = Number(properties.INTPTLAT);
  const lng = Number(properties.INTPTLON);
  if (!finite(lat) || !finite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lng, lat];
}

function dedupePolygons(features: CensusCountyPolygon[]): CensusCountyPolygon[] {
  const byGeoid = new Map<string, CensusCountyPolygon>();
  const anonymous: CensusCountyPolygon[] = [];
  for (const feature of features) {
    const geoid = feature.properties?.GEOID;
    if (geoid) byGeoid.set(geoid, feature);
    else anonymous.push(feature);
  }
  return [...byGeoid.values(), ...anonymous];
}

function parseCountyCollection(value: unknown): CensusCountyData {
  if (!value || typeof value !== 'object') throw new Error('Census county response was not an object.');
  const collection = value as { type?: unknown; features?: unknown };
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    throw new Error('Census county response was not a GeoJSON FeatureCollection.');
  }

  const polygons = dedupePolygons(collection.features.filter(isCountyPolygon));
  const labels: CensusCountyLabel[] = [];

  for (const polygon of polygons) {
    const point = interiorPoint(polygon.properties ?? {});
    if (!point) continue;
    labels.push({
      type: 'Feature',
      id: polygon.properties?.GEOID,
      properties: polygon.properties ?? {},
      geometry: { type: 'Point', coordinates: point },
    });
  }

  return {
    boundaries: { type: 'FeatureCollection', features: polygons },
    labels: { type: 'FeatureCollection', features: labels },
  };
}

function buildQueryUrl([west, south, east, north]: Envelope): string {
  const params = new URLSearchParams({
    where: '1=1',
    geometry: `${west},${south},${east},${north}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'GEOID,BASENAME,NAME,INTPTLAT,INTPTLON',
    returnGeometry: 'true',
    outSR: '4326',
    geometryPrecision: '5',
    resultRecordCount: '10000',
    f: 'geojson',
  });
  return `${BROADCAST_PROVIDERS.censusCountyLayer}/query?${params.toString()}`;
}

function normalizeLongitude(value: number): number {
  let normalized = value;
  while (normalized < -180) normalized += 360;
  while (normalized > 180) normalized -= 360;
  return normalized;
}

function expandedRawBounds(bounds: LngLatBounds): Envelope {
  const rawWest = bounds.getWest();
  const rawEast = bounds.getEast();
  const south = Math.max(-90, bounds.getSouth());
  const north = Math.min(90, bounds.getNorth());

  if (![rawWest, rawEast, south, north].every(finite)) {
    throw new Error('Map viewport produced invalid county query bounds.');
  }

  const width = Math.max(0, rawEast - rawWest);
  const height = Math.max(0, north - south);
  const lngPad = Math.min(3, Math.max(0.15, width * 0.15));
  const latPad = Math.min(2, Math.max(0.1, height * 0.15));

  return [rawWest - lngPad, Math.max(-90, south - latPad), rawEast + lngPad, Math.min(90, north + latPad)];
}

function queryEnvelopes(bounds: LngLatBounds): Envelope[] {
  const [rawWest, south, rawEast, north] = expandedRawBounds(bounds);
  const width = rawEast - rawWest;

  if (width <= 0 || south >= north) return [];
  if (width >= 360) return [[-180, south, 180, north]];

  let west = normalizeLongitude(rawWest);
  let east = west + width;
  const envelopes: Envelope[] = [];

  if (east <= 180) {
    envelopes.push([west, south, east, north]);
  } else {
    envelopes.push([west, south, 180, north]);
    east -= 360;
    envelopes.push([-180, south, east, north]);
  }

  const chunked: Envelope[] = [];
  for (const [segmentWest, segmentSouth, segmentEast, segmentNorth] of envelopes) {
    let cursor = segmentWest;
    while (cursor < segmentEast) {
      const chunkEast = Math.min(segmentEast, cursor + MAX_QUERY_SPAN_DEGREES);
      if (chunkEast > cursor) chunked.push([cursor, segmentSouth, chunkEast, segmentNorth]);
      cursor = chunkEast;
    }
  }

  return chunked;
}

export function countyViewportKey(bounds: LngLatBounds, zoom: number): string {
  if (zoom < COUNTY_MIN_ZOOM) return 'hidden';
  const q = (value: number) => Math.round(value * 4) / 4;
  const envelopes = queryEnvelopes(bounds);
  if (envelopes.length === 0) return 'hidden';
  return envelopes.map((envelope) => envelope.map(q).join(':')).join('|');
}

async function fetchEnvelope(envelope: Envelope, signal: AbortSignal): Promise<CensusCountyData> {
  const response = await fetch(buildQueryUrl(envelope), {
    signal,
    headers: { Accept: 'application/geo+json, application/json' },
  });

  if (!response.ok) throw new Error(`Census county request failed: HTTP ${response.status}.`);
  return parseCountyCollection(await response.json());
}

export async function fetchCensusCounties(
  bounds: LngLatBounds,
  zoom: number,
  signal: AbortSignal,
): Promise<CensusCountyData> {
  if (zoom < COUNTY_MIN_ZOOM) return EMPTY_CENSUS_COUNTY_DATA;

  const envelopes = queryEnvelopes(bounds);
  if (envelopes.length === 0) return EMPTY_CENSUS_COUNTY_DATA;

  const responses = await Promise.all(envelopes.map((envelope) => fetchEnvelope(envelope, signal)));
  const polygons = dedupePolygons(responses.flatMap((response) => response.boundaries.features));
  const polygonData: CensusCountyData = parseCountyCollection({ type: 'FeatureCollection', features: polygons });
  return polygonData;
}
