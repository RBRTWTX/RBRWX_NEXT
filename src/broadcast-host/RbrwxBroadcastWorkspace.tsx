import{IconButton,ToolIcon}from'./OnAirIcons';
import{SessionControls}from'./SessionControls';
import{useMenuPosition}from'./menuPosition';
import{ProgramMirror,useProgramMirror,type MirrorFrame}from'./ProgramMirror';
import {OnAirMenu,useOnAirCommands,BroadcastToolButtons,HiddenPlayback} from './OnAirMenu';
import {OnAirProvider,LiveOnAirDrawing,useOnAirTools} from '../synoptic/OnAirTools';
import {EwxControls,LiveEwxScroll,useEwxAlerts} from '../current-weather/EwxAlerts';
import { SynopticHost, SynopticOverlay, SynopticControls, SynopticPlayback, useSynoptic } from '../synoptic/Scene';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { BroadcastMap, type MapHealth } from '../map/BroadcastMap';
import type { BroadcastBasemapMode, BroadcastLayerGroup } from '../map/broadcastMapContract';
import {
  BroadcastProvider,
  RundownDock,
  SceneLibrary,
  useBroadcast,
  type BroadcastTakeCommand,
  type BroadcastTransitionKind,
} from '../broadcast';
import { RBRWX_INITIAL_RUNDOWN_SCENE_IDS, RBRWX_SCENE_CATALOG } from './sceneCatalog';
import './broadcastHost.css';
import { GraphicsHost, GraphicsOverlay, GraphicsControls } from './GraphicsHost';
import {
  CurrentWeatherHost,
  CurrentProductSelector,
  WeatherControls,
  WeatherPlayback,
  WeatherStatus,
  WeatherMapConnection,
} from './CurrentWeatherHost';
import { useCurrentWeather } from '../current-weather/CurrentWeather';
import {
  ForecastGraphicsHost,
  ForecastGraphicEditorStage,
  ForecastGraphicProperties,
  ForecastGraphicTools,
  useForecastGraphics,
} from './ForecastGraphicsHost';
import { QpfHost, QpfMapConnection, QpfControls, QpfStatus, useQpf } from './QpfHost';

const initialVisibility: Record<BroadcastLayerGroup, boolean> = {
  roads: true,
  cities: true,
  counties: true,
  states: true,
};

type CameraState = { zoom: number; lng: number; lat: number };
type ContextTab = 'properties' | 'palettes' | 'tools';
type ContentTab = 'scenes' | 'data' | 'lineup';
type OperatorAction = string;

interface CanvasStateEnvelope {
  revision: number;
  state: CapturePresentationState | null;
}

interface CapturePresentationState {
  schema: 1;
  mirror?: MirrorFrame;
  hiddenMenuAvailable: boolean;
  ewx?: { enabled: boolean };
}

const healthLabel: Record<MapHealth, string> = {
  starting: 'STARTING',
  ready: 'MAP READY',
  degraded: 'MAP DEGRADED',
  failed: 'MAP FAILED',
};

function contentKeyToBasemapMode(contentKey: string): BroadcastBasemapMode | null {
  if (contentKey === 'map.broadcast') return 'broadcast';
  if (contentKey === 'map.satellite') return 'satellite';
  if (contentKey.startsWith('current.') || contentKey.startsWith('qpf.') || contentKey.startsWith('synoptic.')) return 'broadcast';
  return null;
}

function timeLabel(value: number | null): string {
  return value ? new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'STATIC';
}

function CanvasTimeline() {
  const { product, snapshot, controller } = useCurrentWeather();
  const forecast = useForecastGraphics();
  const qpf = useQpf();
  const synoptic = useSynoptic();
  const times = synoptic.active ? synoptic.snapshot.frames.map(f=>f.time) : forecast.active || qpf.active ? [] : snapshot.times;
  const selected = synoptic.active ? synoptic.snapshot.payload?.time ?? null : forecast.active || qpf.active ? null : snapshot.selectedTime;
  const animated = synoptic.active ? times.length > 1 : !forecast.active && !qpf.active && (product === 'radar' || product === 'satellite');
  const markers = times.length > 24
    ? times.filter((_, index) => index === 0 || index === times.length - 1 || index % Math.ceil(times.length / 22) === 0)
    : times;
  const start = times[0] ?? null;
  const end = times[times.length - 1] ?? null;
  const span = start !== null && end !== null ? Math.max(1, end - start) : 1;

  return <section className="operator-timeline" aria-label="Canvas timeline">
    <div className="operator-timeline__readout">
      <b>{forecast.active ? 'GRAPHIC' : qpf.active ? 'QPF' : animated ? 'FRAME' : 'LIVE'}</b>
      <span>{forecast.active || qpf.active ? 'STATIC' : timeLabel(selected ?? snapshot.time)}</span>
    </div>
    <div className="operator-timeline__track" aria-label={animated ? 'Weather frame timeline' : 'Static scene timeline'}>
      <div className="operator-timeline__rail" />
      {animated && markers.map(time => {
        const left = start === null ? 50 : (time - start) / span * 100;
        const active = time === selected;
        return <button
          key={time}
          type="button"
          className={`operator-timeline__marker ${active ? 'operator-timeline__marker--active' : ''}`}
          style={{ left: `${left}%` }}
          title={new Date(time).toLocaleString()}
          onClick={() => void (synoptic.active ? synoptic.controller.loadFrame(times.indexOf(time)) : controller.seek(time))}
        />;
      })}
      {!animated && <span className="operator-timeline__static-marker" />}
    </div>
    <div className="operator-timeline__range">
      <span>{forecast.active ? forecast.title.toUpperCase() : qpf.active ? qpf.title.toUpperCase() : timeLabel(start)}</span>
      <span>{forecast.active ? 'NON-MAP SCENE' : qpf.active ? 'WPC FORECAST' : timeLabel(end)}</span>
    </div>
  </section>;
}

function CanvasHiddenMenu({
  available,
  onAvailableChange,
  onPopout,
}: {
  available: boolean;
  onAvailableChange: (value: boolean) => void;
  onPopout: () => void;
}) {
  const broadcast = useBroadcast();
  const [open, setOpen] = useState(false);
  const menuStyle=useMenuPosition();
  if (!available) return null;
  const playing = broadcast.state.transport === 'playing';

  return <div className="canvas-hidden-menu onair-wide" style={menuStyle}>
    <button
      className="canvas-hidden-menu__trigger"
      type="button"
      aria-label="Open RBRTW hidden canvas menu"
      aria-expanded={open}
      onClick={() => setOpen(value => !value)}
    >RBRTW</button>
    {open && <div className="canvas-hidden-menu__panel" role="group">
      <OnAirMenu onDrawStart={()=>setOpen(false)}/>
      <HiddenPlayback />
      <details className="onair-rundown"><summary title="Scene rundown controls" aria-label="Scene rundown controls"><ToolIcon name="rundown"/><span>Show</span></summary>
        <div className="onair-submenu">
          <IconButton icon="previous" label="Previous scene" onClick={broadcast.previous}/>
          <IconButton icon={playing?'pause':'play'} label={playing?'Pause rundown':'Play rundown'} disabled={!playing&&!broadcast.canPlay} onClick={playing?broadcast.pause:broadcast.play}/>
          <IconButton icon="next" label="Next scene" onClick={broadcast.next}/>
          <IconButton icon="take" label="Take preview" short="Take" disabled={!broadcast.state.previewItemId} onClick={broadcast.takePreview}/>
          <IconButton icon="loop" label="Toggle show loop" aria-pressed={broadcast.state.loop} onClick={()=>broadcast.setLoop(!broadcast.state.loop)}/>
        </div>
      </details>
      <IconButton icon="popout" label="Pop out canvas" onClick={onPopout}/>
      <IconButton icon="hide" label="Hide RBRTW button" onClick={()=>{setOpen(false);onAvailableChange(false);}}/>
    </div>}
  </div>;
}

function OperatorTransport({ onPopout }: { onPopout: () => void }) {
  const broadcast = useBroadcast();
  const forecast = useForecastGraphics();
  const qpf = useQpf();
  const synoptic = useSynoptic();
  const playing = broadcast.state.transport === 'playing';
  return <section className="operator-transport" aria-label="Operator transport">
    <div className="operator-transport__show">
      <span className="operator-transport__group-label">SHOW</span>
      <button type="button" onClick={broadcast.previous} title="Previous scene">|◀</button>
      <button className="operator-transport__primary" type="button" onClick={playing ? broadcast.pause : broadcast.play} disabled={!playing && !broadcast.canPlay}>{playing ? 'Ⅱ' : '▶'}</button>
      <button type="button" onClick={broadcast.next} title="Next scene">▶|</button>
      <button className="operator-transport__take" type="button" onClick={broadcast.takePreview} disabled={!broadcast.state.previewItemId}>TAKE</button>
    </div>
    <div className="operator-transport__weather">
      {synoptic.active ? <SynopticPlayback /> : forecast.active ? <span className="operator-transport__graphic-label">GRAPHIC SCENE · STATIC</span> : qpf.active ? <span className="operator-transport__graphic-label">WPC QPF · STATIC</span> : <WeatherPlayback />}
    </div>
    <button className="operator-popout" type="button" onClick={onPopout}>POP OUT CANVAS</button>
  </section>;
}

function ContentBrowser({ tab, setTab }: { tab: ContentTab; setTab: (tab: ContentTab) => void }) {
  const broadcast = useBroadcast();
  return <section className="content-browser" aria-label="Content browser">
    <div className="content-browser__toolbar">
      {([['scenes', 'SCENES'], ['data', 'DATA'], ['lineup', 'LIVE LINEUP']] as const).map(([id, label]) =>
        <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>
      )}
      <span className="content-browser__sort">ARRANGE BY · MOST RECENTLY USED</span>
    </div>
    <div className="content-browser__body">
      {tab === 'scenes' && <SceneLibrary />}
      {tab === 'data' && <div className="content-browser__data">
        <div className="content-browser__section-title">WEATHER PRODUCTS</div>
        <CurrentProductSelector />
        <small>Product-specific controls remain in Properties so the content browser stays fast and uncluttered.</small>
      </div>}
      {tab === 'lineup' && <div className="content-browser__lineup-grid">
        {broadcast.state.rundown.map((item, index) => {
          const scene = broadcast.scenes.find(candidate => candidate.id === item.sceneId);
          if (!scene) return null;
          const active = item.id === broadcast.state.programItemId;
          return <button
            key={item.id}
            type="button"
            className={active ? 'content-browser__lineup-item content-browser__lineup-item--program' : 'content-browser__lineup-item'}
            onClick={() => broadcast.selectPreview(item.id)}
            onDoubleClick={broadcast.takePreview}
          >
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{scene.title}</strong>
            <small>{active ? 'PROGRAM' : `${Math.round(item.holdMs / 1000)}s HOLD`}</small>
          </button>;
        })}
      </div>}
    </div>
  </section>;
}

function ContextDock({
  tab,
  setTab,
  basemapMode,
  setBasemapMode,
  visibility,
  toggle,
  diagnosticsOpen,
  setDiagnosticsOpen,
  health,
  healthMessage,
  hiddenMenuAvailable,
  setHiddenMenuAvailable,
}: {
  tab: ContextTab;
  setTab: (tab: ContextTab) => void;
  basemapMode: BroadcastBasemapMode;
  setBasemapMode: (mode: BroadcastBasemapMode) => void;
  visibility: Record<BroadcastLayerGroup, boolean>;
  toggle: (group: BroadcastLayerGroup) => void;
  diagnosticsOpen: boolean;
  setDiagnosticsOpen: (value: boolean) => void;
  health: MapHealth;
  healthMessage: string;
  hiddenMenuAvailable: boolean;
  setHiddenMenuAvailable: (value: boolean) => void;
}) {
  const broadcast = useBroadcast();
  const forecast = useForecastGraphics();
  const qpf = useQpf();
  const synoptic = useSynoptic();

  return <aside className="control-panel operator-context-dock">
    <div className="operator-context-tabs">
      {([['palettes', 'PALETTES'], ['properties', 'PROPERTIES'], ['tools', 'TOOLS']] as const).map(([id, label]) =>
        <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>
      )}
    </div>

    <div className="operator-context-body">
      {tab === 'properties' && <>
        {forecast.active ? <ForecastGraphicProperties /> : <>
          {synoptic.active ? <SynopticControls /> : qpf.active ? <QpfControls /> : <WeatherControls />}
          <div className="panel-divider" />
          <div className="panel-heading"><span>BASEMAP</span><small>scene presentation</small></div>
          {(['broadcast', 'satellite'] as BroadcastBasemapMode[]).map(mode => <button
            key={mode}
            className={`layer-toggle ${basemapMode === mode ? 'layer-toggle--on' : ''}`}
            type="button"
            aria-pressed={basemapMode === mode}
            onClick={() => setBasemapMode(mode)}
          ><span className="layer-toggle__lamp" /><span>{mode === 'satellite' ? 'SATELLITE' : 'MAP'}</span><b>{basemapMode === mode ? 'ON' : 'OFF'}</b></button>)}
        </>}
        <div className="panel-divider" />
        <div className="panel-heading"><span>SCENE TRANSITION</span><small>existing broadcast control</small></div>
        <label className="operator-property-field">Transition
          <select value={broadcast.state.transition.kind} onChange={event => broadcast.setTransitionKind(event.target.value as BroadcastTransitionKind)}>
            <option value="cut">CUT</option>
            <option value="dissolve">DISSOLVE</option>
            <option value="fade">FADE</option>
          </select>
        </label>
        <label className="operator-property-field">Duration (ms)
          <input
            type="number"
            min="0"
            max="3000"
            step="50"
            disabled={broadcast.state.transition.kind === 'cut'}
            value={broadcast.state.transition.durationMs}
            onChange={event => broadcast.setTransitionDuration(Number(event.target.value))}
          />
        </label>
        <button
          className={`layer-toggle ${broadcast.state.loop ? 'layer-toggle--on' : ''}`}
          type="button"
          aria-pressed={broadcast.state.loop}
          onClick={() => broadcast.setLoop(!broadcast.state.loop)}
        ><span className="layer-toggle__lamp" /><span>SHOW LOOP</span><b>{broadcast.state.loop ? 'ON' : 'OFF'}</b></button>
      </>}

      {tab === 'palettes' && <>{synoptic.active ? <SynopticControls /> : <GraphicsControls />}<EwxControls /></>}

      {tab === 'tools' && <><SessionControls />
        {forecast.active ? <ForecastGraphicTools /> : <>
          <div className="panel-heading"><span>MAP APPEARANCE</span><small>reference layers</small></div>
          {(Object.keys(visibility) as BroadcastLayerGroup[]).map(group => <button
            key={group}
            className={`layer-toggle ${visibility[group] ? 'layer-toggle--on' : ''}`}
            type="button"
            onClick={() => toggle(group)}
          ><span className="layer-toggle__lamp" /><span>{group.toUpperCase()}</span><b>{visibility[group] ? 'ON' : 'OFF'}</b></button>)}
        </>}
        <div className="panel-divider" />
        <div className="panel-heading"><span>CANVAS</span><small>operator-only controls</small></div>
        <button
          className={`layer-toggle ${hiddenMenuAvailable ? 'layer-toggle--on' : ''}`}
          type="button"
          aria-pressed={hiddenMenuAvailable}
          onClick={() => setHiddenMenuAvailable(!hiddenMenuAvailable)}
        ><span className="layer-toggle__lamp" /><span>RBRTW MENU BUTTON</span><b>{hiddenMenuAvailable ? 'ON' : 'OFF'}</b></button>
        <button
          className={`layer-toggle ${diagnosticsOpen ? 'layer-toggle--on' : ''}`}
          type="button"
          aria-expanded={diagnosticsOpen}
          onClick={() => setDiagnosticsOpen(!diagnosticsOpen)}
        ><span className="layer-toggle__lamp" /><span>DIAGNOSTICS</span><b>{diagnosticsOpen ? 'OPEN' : 'CLOSED'}</b></button>
        {diagnosticsOpen && <div className="operator-diagnostics"><strong>DIAGNOSTICS</strong><span>Map: {healthLabel[health]}</span><span>{healthMessage}</span><WeatherStatus /><QpfStatus /></div>}
      </>}
    </div>

  </aside>;
}

function OperatorWorkspace({
  basemapMode,
  setBasemapMode,
  visibility,
  setVisibility,
  health,
  setHealth,
  healthMessage,
  setHealthMessage,
  camera,
  setCamera,
  hiddenMenuAvailable,
  setHiddenMenuAvailable,
}: {
  basemapMode: BroadcastBasemapMode;
  setBasemapMode: (mode: BroadcastBasemapMode) => void;
  visibility: Record<BroadcastLayerGroup, boolean>;
  setVisibility: (next: Record<BroadcastLayerGroup, boolean> | ((current: Record<BroadcastLayerGroup, boolean>) => Record<BroadcastLayerGroup, boolean>)) => void;
  health: MapHealth;
  setHealth: (health: MapHealth) => void;
  healthMessage: string;
  setHealthMessage: (message: string) => void;
  camera: CameraState;
  setCamera: (camera: CameraState) => void;
  hiddenMenuAvailable: boolean;
  setHiddenMenuAvailable: (value: boolean) => void;
}) {
  const broadcast = useBroadcast();
  const weather = useCurrentWeather();
  const ewx = useEwxAlerts();
  const tools=useOnAirTools();
  const onAirCommand=useOnAirCommands();
  const forecast = useForecastGraphics();
  const qpf = useQpf();
  const synoptic = useSynoptic();
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [rightTab, setRightTab] = useState<ContextTab>('properties');
  const [contentTab, setContentTab] = useState<ContentTab>('scenes');
  const [popoutMessage, setPopoutMessage] = useState('');
  useEffect(()=>{let stopped=false;const check=async()=>{try{const open=await invoke<boolean>('canvas_window_open');if(!stopped&&typeof open==='boolean')setPopoutMessage(open?'CANVAS WINDOW OPEN':'');}catch{}};void check();const timer=setInterval(()=>void check(),2000);return()=>{stopped=true;clearInterval(timer);};},[]);
  const zoomLabel = useMemo(() => camera.zoom.toFixed(1), [camera.zoom]);

  const toggle = useCallback((group: BroadcastLayerGroup) => {
    setVisibility(current => ({ ...current, [group]: !current[group] }));
  }, [setVisibility]);

  const openPopout = useCallback(() => {
    setPopoutMessage('OPENING…');
    void invoke('open_canvas_window').then(() => setPopoutMessage('CANVAS WINDOW OPEN')).catch(error => setPopoutMessage(`POP OUT FAILED: ${String(error)}`));
  }, []);

  useProgramMirror(synoptic.map, popoutMessage==='CANVAS WINDOW OPEN', async mirror=>{
    await invoke('set_canvas_state',{state:{schema:1,mirror,hiddenMenuAvailable,ewx:{enabled:ewx.state.enabled}}});
  });

  useEffect(() => {
    let cancelled = false;
    let busy = false;
    const apply = (action: OperatorAction) => {
      if(onAirCommand(action))return;
      if (synoptic.active && action === 'previous') synoptic.step(-1);
      else if (synoptic.active && action === 'next') synoptic.step(1);
      else if (synoptic.active && action === 'play-pause') synoptic.play();
      else if (synoptic.active && action === 'loop') synoptic.edit({loop:!synoptic.snapshot.settings.loop});
      else if (['radar','satellite'].includes(weather.product)&&action==='previous') weather.controller.step(-1);
      else if (['radar','satellite'].includes(weather.product)&&action==='next') weather.controller.step(1);
      else if (['radar','satellite'].includes(weather.product)&&action==='play-pause') weather.controller.play();
      else if (['radar','satellite'].includes(weather.product)&&action==='loop') weather.edit({loop:!weather.options.loop});
      else if (action === 'previous') broadcast.previous();
      else if (action === 'play-pause') broadcast.state.transport === 'playing' ? broadcast.pause() : broadcast.play();
      else if (action === 'next') broadcast.next();
      else if (action === 'loop') broadcast.setLoop(!broadcast.state.loop);
      else if (action === 'refresh') void (synoptic.active ? synoptic.controller.refresh() : qpf.active ? qpf.controller.refresh() : weather.controller.refresh());
      else if (action === 'hide-menu') setHiddenMenuAvailable(false);
    };
    const poll = async () => {
      if (busy || cancelled) return;
      busy = true;
      try {
        const actions = await invoke<OperatorAction[]>('take_operator_actions');
        if (!cancelled) for (const action of actions) apply(action);
      } catch {
        // The operator shell remains functional if the optional canvas bridge is unavailable.
      } finally {
        busy = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 100);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [onAirCommand,broadcast, synoptic, qpf.active, qpf.controller, setHiddenMenuAvailable, weather]);

  return <main className="app-shell rbrwx-broadcast-workspace">
    <header className="topbar operator-topbar">
      <div className="brand-block">
        <div className="brand-mark">RBRWX</div>
        <div><div className="brand-title">NEXT</div><div className="brand-subtitle">BROADCAST WEATHER WORKSTATION</div></div>
      </div>
      <div className="operator-topbar__scene">
        <span>PROGRAM</span><strong>{broadcast.programScene?.title ?? '—'}</strong>
        <small>PREVIEW · {broadcast.previewScene?.title ?? '—'}</small>
      </div>
      <div className="topbar-status">
        <span className={`health health--${health}`}>{healthLabel[health]}</span>
        <span>ZOOM {zoomLabel}</span>
        {popoutMessage && <span>{popoutMessage}</span>}
      </div>
    </header>

    <RundownDock />

    <CanvasTimeline />

    <section className="map-stage operator-canvas-stage">
      <div className={`operator-map-layer ${forecast.active ? 'operator-map-layer--behind-graphic' : ''}`}>
        <WeatherMapConnection>{weatherConnect => <QpfMapConnection>{qpfConnect => <BroadcastMap
          onMapReady={map => { const releaseWeather = weatherConnect(map); const releaseQpf = qpfConnect(map); const releaseSynoptic = synoptic.connect(map); return () => { releaseSynoptic(); releaseQpf(); releaseWeather(); }; }}
          basemapMode={basemapMode}
          visibility={visibility}
          onHealthChange={(nextHealth, message) => {
            setHealth(nextHealth);
            setHealthMessage(message);
            void invoke('report_map_health', { health: nextHealth, message }).catch(() => undefined);
          }}
          onCameraChange={setCamera}
        />}</QpfMapConnection>}</WeatherMapConnection>
      </div>
      {forecast.active && <ForecastGraphicEditorStage />}
      {synoptic.active ? <SynopticOverlay /> : <GraphicsOverlay suppressTitle={forecast.active} />}
      <LiveEwxScroll /><LiveOnAirDrawing />
      <CanvasHiddenMenu available={hiddenMenuAvailable} onAvailableChange={setHiddenMenuAvailable} onPopout={openPopout} />
    </section>

    <OperatorTransport onPopout={openPopout} />
    <ContentBrowser tab={contentTab} setTab={setContentTab} />
    <ContextDock
      tab={rightTab}
      setTab={setRightTab}
      basemapMode={basemapMode}
      setBasemapMode={setBasemapMode}
      visibility={visibility}
      toggle={toggle}
      diagnosticsOpen={diagnosticsOpen}
      setDiagnosticsOpen={setDiagnosticsOpen}
      health={health}
      healthMessage={healthMessage}
      hiddenMenuAvailable={hiddenMenuAvailable}
      setHiddenMenuAvailable={setHiddenMenuAvailable}
    />
  </main>;
}

function RbrwxOperatorWorkspaceRoot() {
  const [basemapMode, setBasemapMode] = useState<BroadcastBasemapMode>('broadcast');
  const [visibility, setVisibility] = useState(initialVisibility);
  const [health, setHealth] = useState<MapHealth>('starting');
  const [healthMessage, setHealthMessage] = useState('Initializing renderer…');
  const [camera, setCamera] = useState<CameraState>({ zoom: 8.35, lng: -98.78, lat: 29.43 });
  const [hiddenMenuAvailable, setHiddenMenuAvailable] = useState(true);

  const handleBroadcastTake = useCallback((command: BroadcastTakeCommand) => {
    const nextMode = contentKeyToBasemapMode(command.toScene.contentKey);
    if (nextMode) setBasemapMode(nextMode);
  }, []);

  return <BroadcastProvider
    scenes={RBRWX_SCENE_CATALOG}
    initialRundownSceneIds={RBRWX_INITIAL_RUNDOWN_SCENE_IDS}
    onTake={handleBroadcastTake}
  >
    <CurrentWeatherHost>
      <GraphicsHost>
        <ForecastGraphicsHost>
          <QpfHost><SynopticHost><OnAirProvider>
          <OperatorWorkspace
          basemapMode={basemapMode}
          setBasemapMode={setBasemapMode}
          visibility={visibility}
          setVisibility={setVisibility}
          health={health}
          setHealth={setHealth}
          healthMessage={healthMessage}
          setHealthMessage={setHealthMessage}
          camera={camera}
          setCamera={setCamera}
          hiddenMenuAvailable={hiddenMenuAvailable}
          setHiddenMenuAvailable={setHiddenMenuAvailable}
          />
          </OnAirProvider></SynopticHost></QpfHost>
        </ForecastGraphicsHost>
      </GraphicsHost>
    </CurrentWeatherHost>
  </BroadcastProvider>;
}

export function RbrwxBroadcastWorkspace() {
  const captureMode = Boolean((window as Window & { __RBRWX_CANVAS__?: boolean }).__RBRWX_CANVAS__);
  return captureMode ? <RbrwxCanvasCaptureWorkspace /> : <RbrwxOperatorWorkspaceRoot />;
}

function CaptureHiddenMenu({ available,ewx }: { available: boolean;ewx?:boolean }) {
  const [open, setOpen] = useState(false);
  const menuStyle=useMenuPosition();
  if (!available) return null;
  const action = (value: OperatorAction) => void invoke('request_operator_action', { action: value }).catch(() => undefined);
  return <div className="canvas-hidden-menu canvas-hidden-menu--capture onair-wide" style={menuStyle}>
    <button className="canvas-hidden-menu__trigger" type="button" aria-label="Open RBRTW hidden canvas menu" aria-expanded={open} onClick={() => setOpen(value => !value)}>RBRTW</button>
    {open && <div className="canvas-hidden-menu__panel" role="group">
      <BroadcastToolButtons command={action} ewx={ewx} draw={false}/>
      <div className="onair-playback" aria-label="Hidden menu playback">
        <IconButton icon="previous" label="Previous weather frame" onClick={()=>action('previous')}/>
        <IconButton icon="play" label="Play / pause weather" onClick={()=>action('play-pause')}/>
        <IconButton icon="next" label="Next weather frame" onClick={()=>action('next')}/>
        <IconButton icon="loop" label="Toggle playback loop" onClick={()=>action('loop')}/>
        <IconButton icon="refresh" label="Refresh weather" onClick={()=>action('refresh')}/>
      </div>
      <IconButton icon="hide" label="Hide RBRTW button" onClick={()=>{setOpen(false);action('hide-menu');}}/>
    </div>}
  </div>;
}

function CaptureWeatherCanvas({state}:{state:CapturePresentationState}){return <section className="capture-canvas-stage">{state.mirror?<ProgramMirror frame={state.mirror}/>:<div className="mirror-stalled">WAITING FOR LIVE PROGRAM</div>}<CaptureHiddenMenu available={state.hiddenMenuAvailable} ewx={state.ewx?.enabled}/></section>;}

export function RbrwxCanvasCaptureWorkspace() {
  const [state, setState] = useState<CapturePresentationState | null>(null);
  const revision = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let busy = false;
    const poll = async () => {
      if (busy || cancelled) return;
      busy = true;
      try {
        const envelope = await invoke<CanvasStateEnvelope>('get_canvas_state', { afterRevision: revision.current });
        if (!cancelled && envelope.revision > revision.current) {
          revision.current = envelope.revision;
          if (envelope.state?.schema === 1) setState(envelope.state);
        }
      } catch {
        // Keep the last complete presentation frame if the operator bridge is briefly unavailable.
      } finally {
        busy = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 33);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  if (!state) return <main className="rbrwx-broadcast-workspace rbrwx-capture-window rbrwx-capture-window--loading">RBRWX CANVAS</main>;
  return <main className="rbrwx-broadcast-workspace rbrwx-capture-window"><CaptureWeatherCanvas state={state} /></main>;
}
