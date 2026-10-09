import {FORECAST_LOCATIONS,validLocation,type ForecastLocation} from './locations';
import {EditableText} from '../broadcast-graphics/EditableText';
import {EditHistory} from '../broadcast-graphics/EditHistory';
import {useSceneRecords,type HistoryAction} from '../broadcast-graphics/sceneDocuments';
import { invoke } from '@tauri-apps/api/core';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { loadForecastGraphicsData } from './forecastData';
import {
  displayText,
  freshSceneObjects,
  isForecastGraphicContent,
  nextObjectId,
  templateForContent,
  type ForecastGraphicObject,
  type ForecastGraphicRenderObject,
  type ForecastGraphicsData,
  type ForecastGraphicsSnapshot,
  type ForecastGraphicTemplate,
  type GraphicAssetEntry,
} from './model';
import './forecastGraphics.css';

interface SceneState {
  template: ForecastGraphicTemplate;
  objects: ForecastGraphicObject[];
}

interface ForecastGraphicsModel {
  location:ForecastLocation;setLocation:(location:ForecastLocation)=>void;
  history:(action:HistoryAction)=>void;
  active: boolean;
  sceneId: string | null;
  title: string;
  template: ForecastGraphicTemplate | null;
  data: ForecastGraphicsData | null;
  status: 'loading' | 'ready' | 'stale' | 'unavailable';
  message: string;
  objects: ForecastGraphicObject[];
  selectedId: string | null;
  snapshot: ForecastGraphicsSnapshot;
  assets: GraphicAssetEntry[];
  select: (id: string | null) => void;
  updateObject: (id: string, patch: Partial<ForecastGraphicObject>) => void;
  deleteObject: (id: string) => void;
  duplicateSelected: () => void;
  bringSelectedFront: () => void;
  sendSelectedBack: () => void;
  addText: (boxed?: boolean) => void;
  addIcon: (value: string) => void;
  addShape: (circle?: boolean) => void;
  addAsset: (asset: GraphicAssetEntry) => void;
  resetScene: () => void;
  showTitle: (refresh?:boolean) => void;
  refreshData: () => void;
  refreshAssets: () => void;
}

const Context = createContext<ForecastGraphicsModel | null>(null);
const STORAGE_KEY = 'rbrwx.forecast-graphics.cp1';
const assetCache = new Map<string, string>();

function validStoredScenes(value: unknown): Record<string, SceneState> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, SceneState> = {};
  for (const [key, candidate] of Object.entries(value as Record<string, unknown>)) {
    if (!candidate || typeof candidate !== 'object') continue;
    const state = candidate as Partial<SceneState>;
    if (!state.template || !Array.isArray(state.objects)) continue;
    out[key] = { template: state.template, objects: state.objects as ForecastGraphicObject[] };
  }
  return out;
}

function initialStoredScenes(): Record<string, SceneState> {
  try {
    return validStoredScenes(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}'));
  } catch {
    return {};
  }
}

export function ForecastGraphicsProvider({
  sceneId,
  contentKey,
  title,
  children,
}: {
  sceneId: string | null;
  contentKey: string | null | undefined;
  title: string;
  children: ReactNode;
}) {
  const template = templateForContent(contentKey);
  const active = isForecastGraphicContent(contentKey) && template !== null && sceneId !== null;
  const [scenes, setScenes, history] = useSceneRecords<SceneState>('forecast',initialStoredScenes);
  const [locations,setLocations]=useSceneRecords<ForecastLocation>('forecast-locations',()=>({}));
  const location=locations[sceneId??'startup']??FORECAST_LOCATIONS[0];
  const setLocation=(next:ForecastLocation)=>{if(sceneId&&validLocation(next))setLocations(old=>({...old,[sceneId]:next}));};
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [data, setData] = useState<ForecastGraphicsData | null>(null);
  const [status, setStatus] = useState<ForecastGraphicsModel['status']>('loading');
  const [message, setMessage] = useState('Loading NWS forecast…');
  const [assets, setAssets] = useState<GraphicAssetEntry[]>([]);
  const dataAbort = useRef<AbortController | null>(null);
  const dataRef = useRef<ForecastGraphicsData | null>(null);
  dataRef.current = data;

  useEffect(() => {
    if (!active || !sceneId || !template) return;
    setScenes(current => {
      const existing = current[sceneId];
      if (existing?.template === template) return current;
      return { ...current, [sceneId]: { template, objects: freshSceneObjects(template) } };
    });
  }, [active, sceneId, template]);

  useEffect(() => {
    setSelectedId(null);
  }, [sceneId]);

  const loadData = useCallback(() => {
    dataAbort.current?.abort();
    const abort = new AbortController();
    dataAbort.current = abort;
    const previous = dataRef.current;
    setStatus(previous ? 'stale' : 'loading');
    setMessage(previous ? 'Refreshing NWS forecast…' : 'Loading NWS forecast…');
    void loadForecastGraphicsData(abort.signal,location).then(next => {
      if (abort.signal.aborted) return;
      setData(next);
      setStatus('ready');
      setMessage(`NWS forecast · ${next.locationName}`);
    }).catch(error => {
      if (abort.signal.aborted) return;
      const retained=dataRef.current&&Date.now()-dataRef.current.updatedAt<=24*3600000;
      if(!retained){dataRef.current=null;setData(null);}
      setStatus(retained ? 'stale' : 'unavailable');
      setMessage(`NWS forecast unavailable: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, [location.lat,location.lon,location.name]);

  const needsForecastData = active && template !== 'blank' && template !== 'need-to-know';

  useEffect(() => {
    if (!needsForecastData) return;
    dataRef.current=null;setData(null);
    loadData();
    const timer = window.setInterval(loadData, 10 * 60 * 1000);
    return () => { window.clearInterval(timer); dataAbort.current?.abort(); };
  }, [loadData, needsForecastData]);

  const fallbackObjects = useMemo(() => template ? freshSceneObjects(template) : [], [template]);
  const objects = active && sceneId ? (scenes[sceneId]?.objects ?? fallbackObjects) : [];

  const mutateActive = useCallback((mutate: (objects: ForecastGraphicObject[]) => ForecastGraphicObject[]) => {
    if (!active || !sceneId || !template) return;
    setScenes(current => {
      const base = current[sceneId]?.template === template ? current[sceneId].objects : freshSceneObjects(template);
      return { ...current, [sceneId]: { template, objects: mutate(base) } };
    });
  }, [active, sceneId, template]);

  const updateObject = useCallback((id: string, patch: Partial<ForecastGraphicObject>) => {
    mutateActive(items => items.map(item => item.id === id ? { ...item, ...patch } : item));
  }, [mutateActive]);

  const deleteObject = useCallback((id: string) => {
    mutateActive(items => items.filter(item => item.id !== id));
    setSelectedId(current => current === id ? null : current);
  }, [mutateActive]);

  const addObject = useCallback((factory: (items: ForecastGraphicObject[]) => ForecastGraphicObject) => {
    mutateActive(items => {
      const item = factory(items);
      queueMicrotask(() => setSelectedId(item.id));
      return [...items, item];
    });
  }, [mutateActive]);

  const addText = useCallback((boxed = false) => addObject(items => ({
    id: nextObjectId(items, boxed ? 'textbox' : 'text'),
    label: boxed ? 'Text box' : 'Text',
    kind: boxed ? 'textbox' : 'text',
    style: boxed ? 'body' : 'subheadline',
    x: 700,
    y: 470,
    w: boxed ? 520 : 420,
    h: boxed ? 150 : 80,
    z: Math.max(10, ...items.map(item => item.z + 1)),
    scale: 1,
    text: boxed ? 'TYPE TEXT HERE' : 'TYPE TEXT',
  })), [addObject]);

  const addIcon = useCallback((value: string) => addObject(items => ({
    id: nextObjectId(items, 'icon'), label: 'Icon', kind: 'icon', style: 'icon', x: 835, y: 410, w: 220, h: 220,
    z: Math.max(10, ...items.map(item => item.z + 1)), scale: 1, text: value,
  })), [addObject]);

  const addShape = useCallback((circle = false) => addObject(items => ({
    id: nextObjectId(items, circle ? 'circle' : 'panel'), label: circle ? 'Circle' : 'Panel', kind: 'shape', style: circle ? 'circle' : 'panel',
    x: circle ? 820 : 660, y: circle ? 390 : 410, w: circle ? 280 : 600, h: circle ? 280 : 240,
    z: Math.max(1, ...items.map(item => item.z + 1)), scale: 1,
  })), [addObject]);

  const addAsset = useCallback((asset: GraphicAssetEntry) => addObject(items => ({
    id: nextObjectId(items, asset.kind), label: asset.name, kind: 'asset', style: 'body', x: 720, y: 330, w: 480, h: 360,
    z: Math.max(10, ...items.map(item => item.z + 1)), scale: 1, assetPath: asset.path, assetKind: asset.kind,
  })), [addObject]);

  const selected = selectedId ? objects.find(item => item.id === selectedId) ?? null : null;

  const duplicateSelected = useCallback(() => {
    if (!selected) return;
    addObject(items => ({ ...selected, id: nextObjectId(items, `${selected.id}-copy`), label: `${selected.label} copy`, x: Math.max(0, Math.min(1920 - selected.w * (selected.scale ?? 1), selected.x + 35)), y: Math.max(0, Math.min(1080 - selected.h * (selected.scale ?? 1), selected.y + 35)), z: Math.max(...items.map(item => item.z), selected.z) + 1 }));
  }, [addObject, selected]);

  const bringSelectedFront = useCallback(() => {
    if (!selected) return;
    updateObject(selected.id, { z: Math.max(0, ...objects.map(item => item.z)) + 1 });
  }, [objects, selected, updateObject]);

  const sendSelectedBack = useCallback(() => {
    if (!selected) return;
    updateObject(selected.id, { z: Math.min(0, ...objects.map(item => item.z)) - 1 });
  }, [objects, selected, updateObject]);

  const showTitle=useCallback((refresh=false)=>{
    if(!template)return;
    mutateActive(items=>{
      const defaults=freshSceneObjects(template).filter(item=>item.id.startsWith('header-'));
      if(!defaults.some(item=>item.id==='header-title'))defaults.push({id:'header-title',label:'Scene title',kind:'text',style:'headline',x:108,y:80,w:900,h:80,z:6,text:title});
      const missing=defaults.filter(item=>!items.some(old=>old.id===item.id));
      return [...items.map(item=>refresh&&item.id==='header-title'?{...item,text:title,textOverride:undefined}:item),...missing];
    });
  },[template,title,mutateActive]);

  const resetScene = useCallback(() => {
    if (!active || !sceneId || !template) return;
    setScenes(current => ({ ...current, [sceneId]: { template, objects: freshSceneObjects(template) } }));
    setSelectedId(null);
  }, [active, sceneId, template]);

  const refreshAssets = useCallback(() => {
    void invoke<GraphicAssetEntry[]>('list_graphic_assets').then(list => {
      setAssets(Array.isArray(list) ? list.filter(item => item && (item.kind === 'png' || item.kind === 'svg')) : []);
    }).catch(() => setAssets([]));
  }, []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!active || !selectedId || (event.key !== 'Delete' && event.key !== 'Backspace')) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      event.preventDefault();
      deleteObject(selectedId);
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [active, deleteObject, selectedId]);

  const renderObjects = useMemo<ForecastGraphicRenderObject[]>(() => objects.map(item => ({ ...item, displayText: item.autoKey==='location'&&!data?location.name:item.autoKey==='updated'&&!needsForecastData?'OPERATOR GRAPHIC':displayText(item, data) })), [data, objects,location.name,needsForecastData]);
  const snapshot = useMemo<ForecastGraphicsSnapshot>(() => ({
    active,
    sceneId: active ? sceneId : null,
    template: active ? template : null,
    title,
    objects: active ? renderObjects : [],
  }), [active, renderObjects, sceneId, template, title]);

  const value = useMemo<ForecastGraphicsModel>(() => ({
    location,setLocation,
    history:action=>{if(sceneId&&template)history(sceneId,action,{template,objects:freshSceneObjects(template)});},
    active, sceneId, title, template, data, status, message, objects, selectedId, snapshot, assets,
    select: setSelectedId,
    updateObject,
    deleteObject,
    duplicateSelected,
    bringSelectedFront,
    sendSelectedBack,
    addText,
    addIcon,
    addShape,
    addAsset,
    resetScene,
    showTitle,
    refreshData: loadData,
    refreshAssets,
  }), [active, addAsset, addIcon, addShape, addText, assets, bringSelectedFront, data, deleteObject, duplicateSelected, loadData, message, objects, sceneId, selectedId, sendSelectedBack, snapshot, status, template, title, updateObject, resetScene, showTitle, refreshAssets, history,location]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useForecastGraphics(): ForecastGraphicsModel {
  const value = useContext(Context);
  if (!value) throw new Error('useForecastGraphics must be used inside ForecastGraphicsProvider.');
  return value;
}

function useStageScale(ref: React.RefObject<HTMLDivElement | null>) {
  const [box, setBox] = useState({ w: 1920, h: 1080 });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => setBox({ w: Math.max(1, node.clientWidth), h: Math.max(1, node.clientHeight) });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  const scale = Math.max(.001, Math.min(box.w / 1920, box.h / 1080));
  return { scale, left: (box.w - 1920 * scale) / 2, top: (box.h - 1080 * scale) / 2 };
}

function AssetImage({ relativePath }: { relativePath: string }) {
  const [src, setSrc] = useState(() => assetCache.get(relativePath) ?? '');
  useEffect(() => {
    const cached = assetCache.get(relativePath);
    if (cached) { setSrc(cached); return; }
    let cancelled = false;
    void invoke<string>('read_graphic_asset', { relativePath }).then(value => {
      if (cancelled) return;
      assetCache.set(relativePath, value);
      setSrc(value);
    }).catch(() => { if (!cancelled) setSrc(''); });
    return () => { cancelled = true; };
  }, [relativePath]);
  return src ? <img src={src} alt="" draggable={false} /> : <span className="forecast-asset-missing">ASSET</span>;
}

function ObjectBody({ item, value, editing, beginEdit, commit, cancelEdit }: {
  item: ForecastGraphicObject | ForecastGraphicRenderObject;
  value: string;
  editing: boolean;
  beginEdit?: () => void;
  commit?: (value: string) => void;
  cancelEdit?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{const node=ref.current?.querySelector<HTMLElement>('.forecast-object__text');if(!node||editing)return;const fit=()=>{node.style.removeProperty('font-size');node.style.alignContent='center';node.style.lineHeight='1.16';let size=parseFloat(getComputedStyle(node).fontSize)*(item.fontScale??1);node.style.fontSize=`${size}px`;for(let i=0;i<45&&(node.scrollHeight>node.clientHeight+1||node.scrollWidth>node.clientWidth+1);i++){size*=.94;node.style.fontSize=`${size}px`;}node.style.alignContent='center';};fit();const observer=new ResizeObserver(fit);observer.observe(node);return()=>observer.disconnect();},[value,item.w,item.h,item.style,item.fontScale,editing]);
  if (item.kind === 'asset' && item.assetPath) return <AssetImage relativePath={item.assetPath} />;
  if (item.kind === 'shape') return null;

  return <div ref={ref} style={{width:'100%',height:'100%'}}><EditableText as="div" label={item.label} className="forecast-object__text" value={value} multiline={item.kind==='textbox'} edit={commit} onEditingChange={active=>{if(active)beginEdit?.();else cancelEdit?.();}} /></div>;

}

function EditableObject({ item, scale }: { item: ForecastGraphicObject; scale: number }) {
  const graphics = useForecastGraphics();
  const selected = graphics.selectedId === item.id;
  const [controls,setControls]=useState(false);
  const [editing, setEditing] = useState(false);
  const cancelled = useRef(false);
  const gesture = useRef<{ pointerId: number; mode: 'move' | 'scale'; startX: number; startY: number; start: ForecastGraphicObject } | null>(null);
  const value = displayText(item, graphics.data);

  const beginGesture = (event: PointerEvent<HTMLDivElement>, mode: 'move' | 'scale') => {
    if (event.button !== 0 || editing || (event.target as HTMLElement).closest('.forecast-inline-controls')) return;
    event.preventDefault();
    event.stopPropagation();
    graphics.select(item.id);
    gesture.current = { pointerId: event.pointerId, mode, startX: event.clientX, startY: event.clientY, start: { ...item } };

  };

  const moveGesture = (event: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== event.pointerId || Math.hypot(event.clientX-g.startX,event.clientY-g.startY)<3) return;
    if(!event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    const dx = (event.clientX - g.startX) / scale;
    const dy = (event.clientY - g.startY) / scale;
    if (g.mode === 'move') {
      graphics.updateObject(item.id, {
        x: Math.max(0, Math.min(1920 - g.start.w * (g.start.scale ?? 1), g.start.x + dx)),
        y: Math.max(0, Math.min(1080 - g.start.h * (g.start.scale ?? 1), g.start.y + dy)),
      });
      return;
    }
    const startScale = g.start.scale ?? 1;
    const delta = Math.max(dx / Math.max(40, g.start.w), dy / Math.max(40, g.start.h));
    const maxScale = Math.max(.18, Math.min(4, (1920 - g.start.x) / Math.max(24, g.start.w), (1080 - g.start.y) / Math.max(24, g.start.h)));
    const nextScale = Math.max(.18, Math.min(maxScale, startScale * (1 + delta)));
    graphics.updateObject(item.id, { scale: nextScale });
  };

  const endGesture = (event: PointerEvent<HTMLDivElement>) => {
    if (!gesture.current || gesture.current.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return <div
    className={`forecast-object forecast-object--${item.kind} forecast-style--${item.style}${selected ? ' forecast-object--selected' : ''}`}
    onContextMenu={e=>{e.preventDefault();e.stopPropagation();setControls(v=>!v);}}
    data-object-id={item.id}
    style={{ left: item.x, top: item.y, width: item.w, height: item.h, zIndex: item.z, transform: `scale(${item.scale ?? 1})` }}
    onPointerDown={event => beginGesture(event, 'move')}
    onPointerMove={moveGesture}
    onPointerUp={endGesture}
    onPointerCancel={endGesture}
  >
    <ObjectBody
      item={item}
      value={value}
      editing={editing}
      beginEdit={() => { cancelled.current = false; graphics.select(item.id); setEditing(true); }}
      cancelEdit={() => { cancelled.current = true; setEditing(false); }}
      commit={next => {
        if (!cancelled.current) graphics.updateObject(item.id, item.autoKey ? { textOverride: next } : { text: next });
        cancelled.current = false;
        setEditing(false);
      }}
    />
    {controls&&<div className="wx-inline-controls forecast-inline-controls" style={item.y>600?{top:'auto',bottom:0}:undefined} onPointerDown={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape')setControls(false);}}>
      <label>Text size<input aria-label={`${item.label} text size`} type="range" min="25" max="400" value={Math.round((item.fontScale??1)*100)} onChange={e=>graphics.updateObject(item.id,{fontScale:Number(e.target.value)/100})}/></label>
      <label>Width<input aria-label={`${item.label} width`} type="range" min="40" max={Math.max(40,(1920-item.x)/(item.scale??1))} value={item.w} onChange={e=>graphics.updateObject(item.id,{w:Number(e.target.value)})}/></label>
      <label>Height<input aria-label={`${item.label} height`} type="range" min="24" max={Math.max(24,(1080-item.y)/(item.scale??1))} value={item.h} onChange={e=>graphics.updateObject(item.id,{h:Number(e.target.value)})}/></label>
      <EditHistory act={graphics.history}/><button onClick={()=>setControls(false)}>Done</button>
    </div>}
    {selected && !editing && <div
      className="forecast-resize-handle"
      title="Drag to scale"
      onPointerDown={event => beginGesture(event, 'scale')}
      onPointerMove={moveGesture}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
    />}
  </div>;
}

function StaticObject({ item }: { item: ForecastGraphicRenderObject }) {
  return <div
    className={`forecast-object forecast-object--${item.kind} forecast-style--${item.style} forecast-object--static`}
    style={{ left: item.x, top: item.y, width: item.w, height: item.h, zIndex: item.z, transform: `scale(${item.scale ?? 1})` }}
  ><ObjectBody item={item} value={item.displayText ?? item.text ?? ''} editing={false} /></div>;
}

const BUILTIN_ICONS = ['☀', '☾', '☁', '☂', '⚡', '❄', '≋', '★', '▲', '●'];

function AssetLibrary({ close }: { close: () => void }) {
  const graphics = useForecastGraphics();
  const [tab, setTab] = useState<'png' | 'svg'>('png');
  useEffect(() => { graphics.refreshAssets(); }, [graphics.refreshAssets]);
  const assets = graphics.assets.filter(asset => asset.kind === tab);
  return <div className="forecast-asset-library">
    <div className="forecast-asset-library__head">
      <b>.PNG / .SVG LIBRARY</b>
      <button type="button" onClick={close}>×</button>
    </div>
    <div className="forecast-asset-library__tabs">
      <button type="button" aria-pressed={tab === 'png'} onClick={() => setTab('png')}>PNG</button>
      <button type="button" aria-pressed={tab === 'svg'} onClick={() => setTab('svg')}>SVG</button>
      <button type="button" onClick={graphics.refreshAssets}>REFRESH</button>
    </div>
    <div className="forecast-asset-library__grid">
      {assets.length ? assets.map(asset => <button key={asset.path} type="button" className="forecast-asset-card" onClick={() => { graphics.addAsset(asset); close(); }} title={asset.name}>
        <span><AssetImage relativePath={asset.path} /></span><b>{asset.name}</b>
      </button>) : <p>No {tab.toUpperCase()} assets found in asset-library/{tab}.</p>}
    </div>
  </div>;
}

function AddMenu() {
  const graphics = useForecastGraphics();
  const [open, setOpen] = useState(false);
  const [icons, setIcons] = useState(false);
  const [assets, setAssets] = useState(false);
  return <>
    <div className="forecast-add-menu">
      <button className="forecast-add-menu__trigger" type="button" aria-expanded={open} onClick={() => { setOpen(value => !value); setIcons(false); }}>+ ADD</button>
      {open && <div className="forecast-add-menu__panel">
        <button type="button" onClick={() => { graphics.addText(false); setOpen(false); }}>TEXT</button>
        <button type="button" onClick={() => { graphics.addText(true); setOpen(false); }}>TEXT BOX</button>
        <button type="button" onClick={() => setIcons(value => !value)}>ICON</button>
        <button type="button" onClick={() => { graphics.addShape(false); setOpen(false); }}>PANEL</button>
        <button type="button" onClick={() => { graphics.addShape(true); setOpen(false); }}>CIRCLE</button>
        <button type="button" onClick={() => { setAssets(true); setOpen(false); }}>.PNG / .SVG LIBRARY</button>
        {icons && <div className="forecast-add-menu__icons">
          {BUILTIN_ICONS.map(value => <button key={value} type="button" onClick={() => { graphics.addIcon(value); setOpen(false); setIcons(false); }}>{value}</button>)}
        </div>}
      </div>}
    </div>
    {assets && <AssetLibrary close={() => setAssets(false)} />}
  </>;
}

export function ForecastGraphicEditorStage() {
  const graphics = useForecastGraphics();
  const ref = useRef<HTMLDivElement>(null);
  const layout = useStageScale(ref);
  if (!graphics.active) return null;
  return <section ref={ref} className="forecast-graphic-stage forecast-graphic-stage--editor" aria-label={`${graphics.title} graphic editor`} onPointerDown={event => { if (event.target === event.currentTarget) graphics.select(null); }}>
    <div className="forecast-graphic-design" style={{ left: layout.left, top: layout.top, transform: `scale(${layout.scale})` }} onPointerDown={event => { if (event.target === event.currentTarget) graphics.select(null); }}>
      <div className="forecast-graphic-background" />
      {graphics.objects.slice().sort((a, b) => a.z - b.z).map(item => <EditableObject key={`${graphics.sceneId}:${item.id}`} item={item} scale={layout.scale} />)}
    </div>
    <AddMenu />

  </section>;
}

export function ForecastGraphicSnapshotStage({ snapshot }: { snapshot: ForecastGraphicsSnapshot }) {
  const ref = useRef<HTMLDivElement>(null);
  const layout = useStageScale(ref);
  if (!snapshot.active) return null;
  return <section ref={ref} className="forecast-graphic-stage forecast-graphic-stage--snapshot" aria-label={snapshot.title}>
    <div className="forecast-graphic-design" style={{ left: layout.left, top: layout.top, transform: `scale(${layout.scale})` }}>
      <div className="forecast-graphic-background" />
      {snapshot.objects.slice().sort((a, b) => a.z - b.z).map(item => <StaticObject key={item.id} item={item} />)}
    </div>
  </section>;
}

export function ForecastGraphicProperties() {
  const graphics = useForecastGraphics();
  if (!graphics.active) return null;
  const selected = graphics.selectedId ? graphics.objects.find(item => item.id === graphics.selectedId) ?? null : null;
  return <section className="forecast-properties">
    <div className="panel-heading"><span>GRAPHIC SCENE</span><small>{graphics.message}</small></div>
    <p>Double-click text to type. Drag any selected item to move it. Drag its corner handle to scale it. Press Delete to remove it.</p>
    {selected ? <>
      <div className="forecast-selected-object"><span>SELECTED</span><b>{selected.label}</b></div>
      <div className="forecast-object-actions">
        <button type="button" onClick={graphics.bringSelectedFront}>FRONT</button>
        <button type="button" onClick={graphics.sendSelectedBack}>BACK</button>
        <button type="button" onClick={graphics.duplicateSelected}>DUPLICATE</button>
        <button type="button" onClick={() => graphics.deleteObject(selected.id)}>DELETE</button>
      </div>
    </> : <div className="forecast-selected-object"><span>SELECTED</span><b>NONE</b></div>}
  </section>;
}

export function ForecastGraphicTools() {
  const graphics = useForecastGraphics();
  if (!graphics.active) return null;
  return <section className="forecast-tools">
    <div className="panel-heading"><span>GRAPHIC TOOLS</span><small>simple scene controls</small></div>
    <button type="button" onClick={graphics.refreshData}>REFRESH FORECAST</button>
    <button type="button" onClick={graphics.refreshAssets}>REFRESH ASSET LIBRARY</button>
    <button type="button" onClick={graphics.resetScene}>RESET THIS SCENE</button>
  </section>;
}

export function ForecastGraphicObjectList() {
  const graphics = useForecastGraphics();
  if (!graphics.active) return null;
  return <>
    <div className="operator-object-list__row"><span>Scene</span><b>{graphics.title}</b></div>
    {graphics.objects.slice().sort((a, b) => b.z - a.z).map(item => <button
      key={item.id}
      type="button"
      className={`forecast-object-list__row${graphics.selectedId === item.id ? ' forecast-object-list__row--selected' : ''}`}
      onClick={() => graphics.select(item.id)}
      title={item.label}
    ><span>{item.kind.toUpperCase()}</span><b>{item.label}</b></button>)}
    {!graphics.objects.length && <div className="operator-object-list__row"><span>Canvas</span><b>BLANK</b></div>}
  </>;
}

export function ForecastLocationControls(){
 const g=useForecastGraphics();const [custom,setCustom]=useState(g.location);
 useEffect(()=>setCustom(g.location),[g.location]);
 if(!g.active)return null;
 return <details><summary>Forecast location: {g.location.name}</summary><label>Community<select aria-label="Forecast community" value={FORECAST_LOCATIONS.findIndex(p=>p.lat===g.location.lat&&p.lon===g.location.lon)} onChange={e=>{const p=FORECAST_LOCATIONS[Number(e.target.value)];if(p)g.setLocation(p);}}><option value="-1">Custom coordinates</option>{FORECAST_LOCATIONS.map((p,i)=><option key={p.name} value={i}>{p.name}</option>)}</select></label><label>Name<input maxLength={80} value={custom.name} onChange={e=>setCustom({...custom,name:e.target.value})}/></label><label>Latitude<input type="number" min="-90" max="90" step=".0001" value={custom.lat} onChange={e=>setCustom({...custom,lat:Number(e.target.value)})}/></label><label>Longitude<input type="number" min="-180" max="180" step=".0001" value={custom.lon} onChange={e=>setCustom({...custom,lon:Number(e.target.value)})}/></label><button disabled={!validLocation(custom)} onClick={()=>g.setLocation(custom)}>Apply location</button></details>;
}
