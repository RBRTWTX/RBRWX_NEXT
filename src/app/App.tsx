import { useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { BroadcastMap, type MapHealth } from '../map/BroadcastMap';
import type { BroadcastBasemapMode, BroadcastLayerGroup } from '../map/broadcastMapContract';

const initialVisibility: Record<BroadcastLayerGroup, boolean> = {
  roads: true,
  cities: true,
  counties: true,
  states: true,
};

const healthLabel: Record<MapHealth, string> = {
  starting: 'STARTING',
  ready: 'MAP READY',
  degraded: 'MAP DEGRADED',
  failed: 'MAP FAILED',
};

export function App() {
  const [basemapMode, setBasemapMode] = useState<BroadcastBasemapMode>('broadcast');
  const [visibility, setVisibility] = useState(initialVisibility);
  const [health, setHealth] = useState<MapHealth>('starting');
  const [healthMessage, setHealthMessage] = useState('Initializing renderer…');
  const [camera, setCamera] = useState({ zoom: 8.35, lng: -98.78, lat: 29.43 });

  const zoomLabel = useMemo(() => camera.zoom.toFixed(1), [camera.zoom]);

  const toggle = (group: BroadcastLayerGroup) => {
    setVisibility((current) => ({ ...current, [group]: !current[group] }));
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark">RBRWX</div>
          <div>
            <div className="brand-title">NEXT</div>
            <div className="brand-subtitle">BROADCAST WEATHER WORKSTATION</div>
          </div>
        </div>

        <div className="topbar-status">
          <span className={`health health--${health}`}>{healthLabel[health]}</span>
          <span>ZOOM {zoomLabel}</span>
          <span>{camera.lat.toFixed(2)}°N</span>
          <span>{Math.abs(camera.lng).toFixed(2)}°W</span>
        </div>
      </header>

      <aside className="scene-rail" aria-label="Scene library">
        <div className="rail-heading">SCENES</div>
        <button className="scene-card scene-card--active" type="button">
          <span className="scene-card__eyebrow">BASE</span>
          <strong>Broadcast Map</strong>
          <small>Live geographic foundation</small>
        </button>
        <div className="rail-note">Satellite Map is reference imagery only. GOES and other weather-satellite products remain separate future weather layers.</div>
      </aside>

      <section className="map-stage">
        <BroadcastMap
          basemapMode={basemapMode}
          visibility={visibility}
          onHealthChange={(nextHealth, message) => {
            setHealth(nextHealth);
            setHealthMessage(message);
            void invoke('report_map_health', { health: nextHealth, message }).catch(() => undefined);
          }}
          onCameraChange={setCamera}
        />

        <div className="map-title-card">
          <span className="map-title-card__kicker">RBRWX NEXT</span>
          <strong>{basemapMode === 'satellite' ? 'Satellite Basemap' : 'Broadcast Map Foundation'}</strong>
          <span>{basemapMode === 'satellite' ? 'USGS satellite / aerial reference imagery' : 'South-Central Texas'}</span>
        </div>

        <div className="map-health-message">{healthMessage}</div>
      </section>

      <aside className="control-panel">
        <div className="panel-heading">
          <span>BASEMAP</span>
          <small>exclusive display mode</small>
        </div>
        {(['broadcast', 'satellite'] as BroadcastBasemapMode[]).map((mode) => (
          <button
            key={mode}
            className={`layer-toggle ${basemapMode === mode ? 'layer-toggle--on' : ''}`}
            type="button"
            aria-pressed={basemapMode === mode}
            onClick={() => setBasemapMode(mode)}
          >
            <span className="layer-toggle__lamp" />
            <span>{mode === 'satellite' ? 'SATELLITE' : 'MAP'}</span>
            <b>{basemapMode === mode ? 'ON' : 'OFF'}</b>
          </button>
        ))}
        <div className="panel-divider" />
        <div className="panel-heading">
          <span>MAP REFERENCES</span>
          <small>independent controls</small>
        </div>
        {(Object.keys(visibility) as BroadcastLayerGroup[]).map((group) => (
          <button
            key={group}
            className={`layer-toggle ${visibility[group] ? 'layer-toggle--on' : ''}`}
            type="button"
            onClick={() => toggle(group)}
          >
            <span className="layer-toggle__lamp" />
            <span>{group.toUpperCase()}</span>
            <b>{visibility[group] ? 'ON' : 'OFF'}</b>
          </button>
        ))}
        <div className="panel-contract">
          <strong>LAYER CONTRACT</strong>
          <span>Satellite imagery: below roads/weather</span>
          <span>Road geometry: below weather</span>
          <span>County/state lines: above weather</span>
          <span>Road shields/cities: above weather</span>
        </div>
      </aside>
    </main>
  );
}
