import { useEffect, useRef, useState } from 'react';
import {
  AttributionControl,
  Map as MapLibreMap,
  setWorkerUrl,
  type GeoJSONSource,
  type MapEventType,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { broadcastMapStyle } from './broadcastMapStyle';
import { installBroadcastRouteImageResolver } from './routeBadges';
import {
  assertBroadcastLayerSeparation,
  BROADCAST_BASEMAP_MODES,
  BROADCAST_LAYER_GROUPS,
  BROADCAST_SOURCE_IDS,
  type BroadcastBasemapMode,
  type BroadcastLayerGroup,
} from './broadcastMapContract';
import {
  countyViewportKey,
  EMPTY_CENSUS_COUNTY_DATA,
  fetchCensusCounties,
} from './censusCounties';

setWorkerUrl(workerUrl);

export type MapHealth = 'starting' | 'ready' | 'degraded' | 'failed';

interface BroadcastMapProps {
  basemapMode: BroadcastBasemapMode;
  visibility: Record<BroadcastLayerGroup, boolean>;
  onHealthChange: (health: MapHealth, message: string) => void;
  onCameraChange?: (camera: { zoom: number; lng: number; lat: number }) => void;
}

const HOME = {
  center: [-98.78, 29.43] as [number, number],
  zoom: 8.35,
};

function applyVisibility(map: MapLibreMap, group: BroadcastLayerGroup, visible: boolean): void {
  const value = visible ? 'visible' : 'none';
  for (const layerId of BROADCAST_LAYER_GROUPS[group]) {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', value);
  }
}

function applyBasemapMode(map: MapLibreMap, activeMode: BroadcastBasemapMode): void {
  for (const [mode, layerIds] of Object.entries(BROADCAST_BASEMAP_MODES) as [BroadcastBasemapMode, string[]][]) {
    const value = mode === activeMode ? 'visible' : 'none';
    for (const layerId of layerIds) {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', value);
    }
  }
}

export function BroadcastMap({ basemapMode, visibility, onHealthChange, onCameraChange }: BroadcastMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const basemapModeRef = useRef(basemapMode);
  const visibilityRef = useRef(visibility);
  const healthCallbackRef = useRef(onHealthChange);
  const cameraCallbackRef = useRef(onCameraChange);
  const [ready, setReady] = useState(false);

  basemapModeRef.current = basemapMode;
  visibilityRef.current = visibility;
  healthCallbackRef.current = onHealthChange;
  cameraCallbackRef.current = onCameraChange;

  useEffect(() => {
    assertBroadcastLayerSeparation();
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    healthCallbackRef.current('starting', 'Loading broadcast geographic sources…');

    const problems = new Map<string, string>();
    let hardFailure: string | null = null;
    let styleLoaded = false;
    let initialCountyResolved = false;
    let countyAbort: AbortController | null = null;
    let lastCountyKey = '';

    const reportHealth = () => {
      if (hardFailure) {
        healthCallbackRef.current('failed', hardFailure);
        return;
      }
      const firstProblem = problems.values().next().value as string | undefined;
      if (firstProblem) {
        healthCallbackRef.current('degraded', firstProblem);
        return;
      }
      if (styleLoaded && initialCountyResolved) healthCallbackRef.current('ready', 'Broadcast geographic sources and authoritative county sources loaded.');
    };

    const map = new MapLibreMap({
      container,
      center: HOME.center,
      zoom: HOME.zoom,
      minZoom: 2.5,
      maxZoom: 18,
      pitch: 0,
      bearing: 0,
      renderWorldCopies: false,
      attributionControl: false,
      canvasContextAttributes: { antialias: true },
      fadeDuration: 0,
      validateStyle: true,
    });

    mapRef.current = map;
    installBroadcastRouteImageResolver(map);
    map.addControl(new AttributionControl({ compact: true }), 'bottom-right');

    const refreshCounties = async () => {
      if (!styleLoaded || !map.getSource(BROADCAST_SOURCE_IDS.countyBoundaries) || !map.getSource(BROADCAST_SOURCE_IDS.countyLabels)) return;

      const key = countyViewportKey(map.getBounds(), map.getZoom());
      if (key === lastCountyKey) return;
      lastCountyKey = key;

      countyAbort?.abort();
      countyAbort = new AbortController();

      const boundarySource = map.getSource(BROADCAST_SOURCE_IDS.countyBoundaries) as GeoJSONSource | undefined;
      const labelSource = map.getSource(BROADCAST_SOURCE_IDS.countyLabels) as GeoJSONSource | undefined;
      if (!boundarySource || !labelSource) return;

      if (key === 'hidden') {
        boundarySource.setData(EMPTY_CENSUS_COUNTY_DATA.boundaries);
        labelSource.setData(EMPTY_CENSUS_COUNTY_DATA.labels);
        problems.delete('census-counties');
        initialCountyResolved = true;
        reportHealth();
        return;
      }

      try {
        const counties = await fetchCensusCounties(map.getBounds(), map.getZoom(), countyAbort.signal);
        if (countyAbort.signal.aborted) return;
        boundarySource.setData(counties.boundaries);
        labelSource.setData(counties.labels);
        problems.delete('census-counties');
        initialCountyResolved = true;
        reportHealth();
      } catch (error) {
        if (countyAbort.signal.aborted) return;
        const message = error instanceof Error ? error.message : String(error);
        problems.set('census-counties', `Authoritative county source unavailable: ${message}`);
        initialCountyResolved = true;
        reportHealth();
      }
    };

    map.on('styleimagemissing', (event: MapEventType['styleimagemissing']) => {
      problems.set(`sprite:${event.id}`, `Basemap sprite missing: ${event.id}`);
      reportHealth();
    });

    map.on('error', (event: MapEventType['error']) => {
      const message = event.error?.message ?? 'Unknown MapLibre error';
      if (/source|tile|glyph|sprite|style|worker|webgl/i.test(message)) {
        problems.set('maplibre', message);
        reportHealth();
      }
    });

    map.once('load', () => {
      const requiredSources = [
        BROADCAST_SOURCE_IDS.basemap,
        BROADCAST_SOURCE_IDS.satellite,
        BROADCAST_SOURCE_IDS.relief,
        BROADCAST_SOURCE_IDS.countyBoundaries,
        BROADCAST_SOURCE_IDS.countyLabels,
        BROADCAST_SOURCE_IDS.weatherSlot,
      ];

      for (const id of requiredSources) {
        if (!map.getSource(id)) {
          hardFailure = `Broadcast map contract missing source: ${id}`;
          reportHealth();
          return;
        }
      }

      for (const [group, visible] of Object.entries(visibilityRef.current) as [BroadcastLayerGroup, boolean][]) {
        applyVisibility(map, group, visible);
      }
      applyBasemapMode(map, basemapModeRef.current);

      styleLoaded = true;
      setReady(true);
      void refreshCounties();
    });

    const emitCameraAndRefresh = () => {
      const center = map.getCenter();
      cameraCallbackRef.current?.({ zoom: map.getZoom(), lng: center.lng, lat: center.lat });
      void refreshCounties();
    };
    map.on('moveend', emitCameraAndRefresh);

    // Install the owned style only after the missing-image resolver and all
    // health listeners are active. This prevents a referenced local badge from
    // racing style evaluation during initial load.
    map.setStyle(broadcastMapStyle);

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(container);

    return () => {
      countyAbort?.abort();
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    applyBasemapMode(map, basemapMode);
  }, [basemapMode, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const [group, visible] of Object.entries(visibility) as [BroadcastLayerGroup, boolean][]) {
      applyVisibility(map, group, visible);
    }
  }, [ready, visibility]);

  return <div ref={containerRef} className="broadcast-map" aria-label="RBRWX broadcast map" />;
}
