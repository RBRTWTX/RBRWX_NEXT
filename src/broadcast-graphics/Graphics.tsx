import {EditableText} from './EditableText';
import {useSceneRecords,type HistoryAction} from './sceneDocuments';
import {ResizeBox} from './ResizeBox';
import { BarLibrary } from './BarLibrary';
import { barPresentation, type BarStyles } from './barStyles';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type PointerEvent } from 'react';
import { changeLayout, constrain, freshCopy, freshLayouts, sizes, titleText, type Copy, type Kind, type Layout, type Scene } from './state';
import './graphics.css';
import { KeysMenu, TitleKey } from './keys/Keys';
import { resolveWeatherKey, type WeatherKey } from './keys/model';
interface Model {
  history:(action:HistoryAction)=>void; extraKeys: readonly WeatherKey[]; scene: Scene | null; copy: Copy; edit: (patch: Partial<Copy>) => void;
  visible: Record<Kind, boolean>; toggle: (kind: Kind) => void;
  layouts: Record<Kind, Layout>; position: (kind: Kind, layout: Layout) => void;
}
export interface GraphicsSnapshot {
  scene: Scene | null;
  copy: Copy;
  visible: Record<Kind, boolean>;
  layouts: Record<Kind, Layout>;
}
const Context = createContext<Model | null>(null);
export function useGraphics() { const value = useContext(Context); if (!value) throw new Error('Graphics provider missing'); return value; }
export function useGraphicsSnapshot(): GraphicsSnapshot {
  const { scene, copy, visible, layouts } = useGraphics();
  return { scene, copy, visible, layouts };
}
export function GraphicsProvider({ scene, children, extraKeys = [] }: { scene: Scene | null; children: ReactNode; extraKeys?: readonly WeatherKey[] }) {
  const id = scene?.id ?? 'startup';
  const initial=()=>({copy:freshCopy(),visible:{title:false,lower:false,ticker:false},layouts:freshLayouts()});
  const [records,setRecords,history]=useSceneRecords<ReturnType<typeof initial>>('graphics',()=>{
    try {const copies=JSON.parse(localStorage.getItem('rbrwx-graphic-copy-v2')??'{}'),styles=JSON.parse(localStorage.getItem('rbrwx-graphic-bar-styles-v1')??'{}');return Object.fromEntries(Object.entries(copies).map(([key,value])=>[key,{...initial(),copy:{...freshCopy(),...(value as Copy),barStyles:styles[key]}}]));}catch{return {};}
  });
  useEffect(()=>{if(!records[id])setRecords(old=>old[id]?old:({...old,[id]:initial()}));},[id,records,setRecords]);
  const state=records[id]??initial(),{copy,visible,layouts}=state;
  const update=(patch:Partial<typeof state>)=>setRecords(old=>({...old,[id]:{...(old[id]??initial()),...patch}}));
  return <Context.Provider value={{scene,copy,visible,layouts,extraKeys,history:action=>history(id,action,initial()),
    edit:patch=>update({copy:{...copy,...patch}}),
    toggle:kind=>update({visible:{...visible,[kind]:!visible[kind]}}),
    position:(kind,layout)=>update({layouts:{...layouts,[kind]:constrain(kind,layout)}}),
  }}>{children}</Context.Provider>;
}
function ServiceLegend({url,label}:{url:string;label:string}){const[failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[url]);return <div className="wx-service-key"><span>{label}</span>{failed?<b>Key unavailable</b>:<img src={url} alt={label} onError={()=>setFailed(true)}/>}</div>;}
function Bar({ kind, viewScale }: { kind: Kind; viewScale: number }) {
  const { scene, copy, edit, layouts, position, extraKeys, history } = useGraphics();
  const weatherKey = kind === 'title' ? resolveWeatherKey(copy.keySelection ?? 'auto', scene?.weatherKeyId, extraKeys) : undefined;
  const layout = layouts[kind];
  const appearance = barPresentation(copy.barStyles?.[kind]);
  const [width,height]=sizes[kind];
  const box=copy.barBoxes?.[kind]??{x:layout.x/19.2,y:layout.y/10.8,width:width*layout.scale/19.2,height:height*layout.scale/10.8,fontScale:layout.scale};
  return <ResizeBox history={history} box={box} label={kind} textOnly={copy.barStyles?.[kind]?.textSizing} edit={box=>edit({barBoxes:{...copy.barBoxes,[kind]:box}})}>
   <div className={`wxg-bar wxg-${kind}${kind==='title'&&(weatherKey||scene?.legendUrl)?' wxg-with-key':''}`} data-graphic={kind} data-bar-design={appearance.design} style={appearance.style}>
    <EditableText as="div" scrolling={kind === 'ticker'} className="wxg-text" label={`${kind} text`} key={`${scene?.id ?? 'startup'}:${kind}`} value={kind === 'title' ? titleText(scene, copy) : copy[kind]}
      edit={text => edit(kind === 'title' ? { manual: true, title: text } : { [kind]: text })} />
    {weatherKey && <TitleKey value={weatherKey} />}
    {kind==='title'&&scene?.legendUrl&&<ServiceLegend url={scene.legendUrl} label={scene.legendTitle??'NWS service legend'}/> }
  </div></ResizeBox>;
}
export function GraphicsOverlay({suppressTitle=false}:{suppressTitle?:boolean}={}) {
  const { visible, scene } = useGraphics();
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1920, h: 1080 });
  useEffect(() => { const node = ref.current; if (!node) return; const update = () => setSize({ w: node.clientWidth, h: node.clientHeight }); update(); const observer = new ResizeObserver(update); observer.observe(node); return () => observer.disconnect(); }, []);
  const scale = Math.max(.001, Math.min(size.w / 1920, size.h / 1080));
  return <div className="wxg-overlay" ref={ref} data-title-visible={visible.title}>
    <div className="wxg-design" style={{ left: (size.w - 1920 * scale) / 2, top: (size.h - 1080 * scale) / 2, transform: `scale(${scale})` }}>
      {(['title', 'lower', 'ticker'] as Kind[]).filter(kind => visible[kind]&&!(suppressTitle&&kind==='title')).map(kind => <Bar key={`${scene?.id}:${kind}`} kind={kind} viewScale={scale} />)}
    </div>
  </div>;
}

function SnapshotBar({ kind, snapshot, extraKeys }: { kind: Kind; snapshot: GraphicsSnapshot; extraKeys: readonly WeatherKey[] }) {
  const { scene, copy, layouts } = snapshot;
  const weatherKey = kind === 'title' ? resolveWeatherKey(copy.keySelection ?? 'auto', scene?.weatherKeyId, extraKeys) : undefined;
  const layout = layouts[kind];
  const appearance = barPresentation(copy.barStyles?.[kind]);
  const [width, height] = sizes[kind];
  const value = kind === 'title' ? titleText(scene, copy) : copy[kind];
  const box=copy.barBoxes?.[kind]??{x:layout.x/19.2,y:layout.y/10.8,width:width*layout.scale/19.2,height:height*layout.scale/10.8,fontScale:layout.scale};
  return <ResizeBox box={box} label={kind}>
  <div className={`wxg-bar wxg-${kind} wxg-static${kind==='title'&&(weatherKey||scene?.legendUrl)?' wxg-with-key':''}`} data-graphic={kind} data-bar-design={appearance.design} style={{...appearance.style,pointerEvents:'none'}}>
    <div className="wxg-text">{kind === 'ticker' ? <span className="wxg-crawl">{value}</span> : value}</div>
    {weatherKey && <TitleKey value={weatherKey} />}
    {kind==='title'&&scene?.legendUrl&&<ServiceLegend url={scene.legendUrl} label={scene.legendTitle??'NWS service legend'}/> }
  </div></ResizeBox>;
}

export function GraphicsSnapshotOverlay({ snapshot, extraKeys = [] }: { snapshot: GraphicsSnapshot; extraKeys?: readonly WeatherKey[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1920, h: 1080 });
  useEffect(() => { const node = ref.current; if (!node) return; const update = () => setSize({ w: node.clientWidth, h: node.clientHeight }); update(); const observer = new ResizeObserver(update); observer.observe(node); return () => observer.disconnect(); }, []);
  const scale = Math.max(.001, Math.min(size.w / 1920, size.h / 1080));
  return <div className="wxg-overlay wxg-overlay--snapshot" ref={ref} data-title-visible={snapshot.visible.title}>
    <div className="wxg-design" style={{ left: (size.w - 1920 * scale) / 2, top: (size.h - 1080 * scale) / 2, transform: `scale(${scale})` }}>
      {(['title', 'lower', 'ticker'] as Kind[]).filter(kind => snapshot.visible[kind]).map(kind => <SnapshotBar key={`${snapshot.scene?.id}:${kind}`} kind={kind} snapshot={snapshot} extraKeys={extraKeys} />)}
    </div>
  </div>;
}

export function GraphicsControls() {
  const { scene, copy, edit, visible, toggle, layouts, position, extraKeys, history } = useGraphics();
  return <section className="wxg-menu" aria-label="Graphics">
    <div className="panel-heading">GRAPHICS</div>
    <button onClick={()=>{if(!visible.title)toggle('title');}}>Add / show title bar</button>
    <button onClick={()=>{edit({manual:false});if(!visible.title)toggle('title');}}>Refresh title from scene</button>
    <BarLibrary value={copy.barStyles} onChange={barStyles => edit({ barStyles })} targets={['title', 'lower', 'ticker']} disabled={!scene} />
    {(['title', 'lower', 'ticker'] as Kind[]).map(kind => <label key={kind} className="wxg-toggle"><span>{kind === 'title' ? 'Title bar' : kind === 'lower' ? 'Lower third' : 'Ticker'}</span><input type="checkbox" checked={visible[kind]} onChange={() => toggle(kind)} /></label>)}
    <KeysMenu extraKeys={extraKeys} selection={copy.keySelection ?? 'auto'} weatherKeyId={scene?.weatherKeyId} disabled={!scene} choose={keySelection => { edit({ keySelection }); if (keySelection !== 'none' && resolveWeatherKey(keySelection, scene?.weatherKeyId, extraKeys) && !visible.title) toggle('title'); }} />
  </section>;
}
