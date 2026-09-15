import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import type { Map as WeatherMap } from 'maplibre-gl';
import { CurrentWeatherController } from './controller';
import { defaultOptions, initialSnapshot, type Options, type Product, type Snapshot } from './model';
import './weather.css';

interface Runtime { product: Product; snapshot: Snapshot; options: Options; edit: (patch: Partial<Options>) => void; controller: CurrentWeatherController }
const Context = createContext<Runtime | null>(null);
export function useCurrentWeather() { const value = useContext(Context); if (!value) throw Error('Current weather provider missing'); return value; }

export function CurrentWeatherProvider({ sceneId, product, children }: { sceneId: string; product: Product; children: ReactNode }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot), [settings, setSettings] = useState<Record<string, Options>>({});
  const controller = useMemo(() => new CurrentWeatherController(setSnapshot), []), options = settings[sceneId] ?? defaultOptions();
  useLayoutEffect(() => { controller.select(sceneId, product, options, ''); }, [controller, sceneId, product, options.units, options.opacity, options.loop, options.mrmsEnabled, options.sweepsEnabled]);
  useEffect(() => () => controller.destroy(), [controller]);
  return <Context.Provider value={{ product, snapshot, options, controller, edit: patch => setSettings(old => ({ ...old, [sceneId]: { ...(old[sceneId] ?? defaultOptions()), ...patch } })) }}>{children}</Context.Provider>;
}

export function WeatherMapConnection({ children }: { children: (connect: (map: WeatherMap) => () => void) => ReactNode }) {
  const { controller } = useCurrentWeather(); return children(map => controller.connect(map, 'rbrwx-county-boundary'));
}

const shortRadarId = (id: string) => id.startsWith('K') && id.length === 4 ? id.slice(1) : id;

export function WeatherControls() {
  const { product, snapshot, options, edit, controller } = useCurrentWeather();
  if (product === 'map') return null;
  return <section className="wx-current-controls" aria-label="Current weather controls">
    {product === 'observations' && <>
      <div className="panel-heading">TEMPERATURE</div>
      <label><input type="checkbox" checked={options.units === 'metric'} onChange={e => edit({ units: e.target.checked ? 'metric' : 'imperial' })} /> Metric units</label>
      <label>Layer opacity<input aria-label="Temperature layer opacity" type="range" min="0" max="100" value={Math.round(options.opacity * 100)} onChange={e => edit({ opacity: Number(e.target.value) / 100 })} /></label>
      <button type="button" onClick={() => void controller.refresh()}>Refresh temperatures</button>
    </>}

    {product === 'radar' && <>
      <div className="panel-heading">NEXRAD RADAR</div>
      <label className="wx-radar-picker">Primary radar
        <select aria-label="Primary radar" value={snapshot.primaryRadarId ?? ''} onChange={e => void controller.setPrimaryRadar(e.target.value)}>
          {!snapshot.radarSites.length ? <option value="">Loading radar sites…</option> : <option value="">No primary radar selected</option>}
          {snapshot.radarSites.map(site => <option key={site.id} value={site.id}>{site.city} — {shortRadarId(site.id)}</option>)}
        </select>
      </label>
      <div className="wx-radar-active" aria-label="Active radar sweeps">
        {snapshot.activeRadarIds.map(id => <button key={id} type="button" title={`Turn off ${shortRadarId(id)} sweep`} onClick={() => void controller.toggleRadarSite(id)}>{shortRadarId(id)} ×</button>)}
        {!snapshot.activeRadarIds.length && <small>No site sweeps active</small>}
      </div>
      <small className="wx-radar-hint">Click radar towers on the map to toggle up to 3 sweeps.</small>
      <label><input type="checkbox" checked={options.sweepsEnabled} onChange={e => edit({ sweepsEnabled: e.target.checked })} /> Radar sweep animation</label>
      <label><input type="checkbox" checked={options.mrmsEnabled} onChange={e => edit({ mrmsEnabled: e.target.checked })} /> MRMS backup mosaic</label>
      <label>Radar opacity<input aria-label="Radar opacity" type="range" min="0" max="100" value={Math.round(options.opacity * 100)} onChange={e => edit({ opacity: Number(e.target.value) / 100 })} /></label>
      <button type="button" onClick={() => void controller.refresh()}>Refresh radar</button>
    </>}

    {product === 'satellite' && <>
      <div className="panel-heading">SATELLITE</div>
      <label>Satellite opacity<input aria-label="Satellite opacity" type="range" min="0" max="100" value={Math.round(options.opacity * 100)} onChange={e => edit({ opacity: Number(e.target.value) / 100 })} /></label>
      <button type="button" onClick={() => void controller.refresh()}>Refresh satellite</button>
    </>}
  </section>;
}

export function WeatherPlayback() {
  const { product, snapshot, options, edit, controller } = useCurrentWeather(); if (product !== 'radar' && product !== 'satellite') return null;
  const disabled = snapshot.times.length < 2;
  return <div className="wx-weather-playback" aria-label="Weather imagery playback">
    <button type="button" aria-label="Previous weather frame" disabled={disabled} onClick={() => controller.step(-1)}>Previous</button>
    <button type="button" disabled={disabled} onClick={() => controller.play()}>{snapshot.playing ? 'Pause weather' : 'Play weather'}</button>
    <button type="button" aria-label="Next weather frame" disabled={disabled} onClick={() => controller.step(1)}>Next</button>
    <label><input type="checkbox" checked={options.loop} onChange={e => edit({ loop: e.target.checked })} /> Loop</label>
    <button type="button" disabled={!snapshot.times.length} onClick={() => { controller.stop(); void controller.seek(snapshot.times[snapshot.times.length - 1]); }}>Latest</button>
    <input aria-label="Weather frame" type="range" min="0" max={Math.max(0, snapshot.times.length - 1)} disabled={disabled} value={Math.max(0, snapshot.times.indexOf(snapshot.selectedTime ?? 0))} onChange={e => { controller.stop(); void controller.seek(snapshot.times[Number(e.target.value)]); }} />
    <span>{snapshot.time ? new Date(snapshot.time).toLocaleTimeString() : 'No image loaded'}</span>
  </div>;
}

export function WeatherStatus() { const { product, snapshot } = useCurrentWeather(); return product === 'map' ? null : <div className="wx-weather-status" role="status">{snapshot.message}</div>; }
