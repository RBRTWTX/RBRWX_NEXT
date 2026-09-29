import {ResizeBox} from './ResizeBox';
import { BarLibrary } from './BarLibrary';
import { barPresentation, type BarStyles } from './barStyles';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type PointerEvent } from 'react';
import { changeLayout, constrain, freshCopy, freshLayouts, sizes, titleText, type Copy, type Kind, type Layout, type Scene } from './state';
import './graphics.css';
import { KeysMenu, TitleKey } from './keys/Keys';
import { resolveWeatherKey, type WeatherKey } from './keys/model';
interface Model {
  extraKeys: readonly WeatherKey[]; scene: Scene | null; copy: Copy; edit: (patch: Partial<Copy>) => void;
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
  const [copies, setCopies] = useState<Record<string, Copy>>(()=>{try{return JSON.parse(localStorage.getItem('rbrwx-graphic-copy-v2')??'{}')??{};}catch{return {};}});
  const [styles, setStyles] = useState<Record<string, BarStyles>>(() => {
    try { const saved = JSON.parse(localStorage.getItem('rbrwx-graphic-bar-styles-v1') ?? '{}'); return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}; } catch { return {}; }
  });
  useEffect(() => { try { localStorage.setItem('rbrwx-graphic-bar-styles-v1', JSON.stringify(styles)); } catch { /* Keep editing if storage is unavailable. */ } }, [styles]);
  useEffect(()=>{try{localStorage.setItem('rbrwx-graphic-copy-v2',JSON.stringify(copies));}catch{}},[copies]);
  const [visible, setVisible] = useState({ title: false, lower: false, ticker: false });
  const [layouts, setLayouts] = useState(freshLayouts);
  const id = scene?.id ?? 'startup';
  const copy = { ...(copies[id] ?? freshCopy()), barStyles: styles[id] };
  return <Context.Provider value={{ scene, copy, visible, layouts, extraKeys,
    edit: patch => {
      if (patch.barStyles !== undefined) setStyles(old => ({ ...old, [id]: patch.barStyles! }));
      setCopies(old => ({ ...old, [id]: { ...(old[id] ?? freshCopy()), ...patch } }));
    },
    toggle: kind => setVisible(old => ({ ...old, [kind]: !old[kind] })),
    position: (kind, layout) => setLayouts(old => ({ ...old, [kind]: constrain(kind, layout) })),
  }}>{children}</Context.Provider>;
}
function Text({ value, commit, scrolling = false }: { value: string; commit: (text: string) => void; scrolling?: boolean }) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cancel = useRef(false);
  useEffect(() => { if (editing && ref.current) { ref.current.textContent = value; ref.current.focus(); } }, [editing]);
  return <div ref={ref} className="wxg-text" contentEditable={editing} suppressContentEditableWarning spellCheck={false}
    onDoubleClick={event => { event.stopPropagation(); cancel.current = false; setEditing(true); }}
    onPointerDown={event => { if (editing) event.stopPropagation(); }}
    onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { cancel.current = true; event.currentTarget.textContent = value; event.currentTarget.blur(); } else if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }}
    onBlur={event => { if (!cancel.current) commit(event.currentTarget.textContent ?? ''); setEditing(false); }}
    onPaste={event => { event.preventDefault(); const text = event.clipboardData.getData('text/plain').replace(/[\r\n]+/g, ' '); const selection = window.getSelection(); if (selection?.rangeCount) { const range = selection.getRangeAt(0); range.deleteContents(); const node = document.createTextNode(text); range.insertNode(node); range.setStartAfter(node); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); } }}
  >{editing ? undefined : scrolling ? <span className="wxg-crawl">{value}</span> : value}</div>;
}
function ServiceLegend({url,label}:{url:string;label:string}){const[failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[url]);return <div className="wx-service-key"><span>{label}</span>{failed?<b>Key unavailable</b>:<img src={url} alt={label} onError={()=>setFailed(true)}/>}</div>;}
function Bar({ kind, viewScale }: { kind: Kind; viewScale: number }) {
  const { scene, copy, edit, layouts, position, extraKeys } = useGraphics();
  const weatherKey = kind === 'title' ? resolveWeatherKey(copy.keySelection ?? 'auto', scene?.weatherKeyId, extraKeys) : undefined;
  const layout = layouts[kind];
  const appearance = barPresentation(copy.barStyles?.[kind]);
  const [width,height]=sizes[kind];
  const box=copy.barBoxes?.[kind]??{x:layout.x/19.2,y:layout.y/10.8,width:width*layout.scale/19.2,height:height*layout.scale/10.8,fontScale:layout.scale};
  return <ResizeBox box={box} label={kind} textOnly={copy.barStyles?.[kind]?.textSizing} edit={box=>edit({barBoxes:{...copy.barBoxes,[kind]:box}})}>
   <div className={`wxg-bar wxg-${kind}${kind==='title'&&(weatherKey||scene?.legendUrl)?' wxg-with-key':''}`} data-graphic={kind} data-bar-design={appearance.design} style={appearance.style}>
    <Text scrolling={kind === 'ticker'} key={`${scene?.id ?? 'startup'}:${kind}`} value={kind === 'title' ? titleText(scene, copy) : copy[kind]}
      commit={text => edit(kind === 'title' ? { manual: true, title: text } : { [kind]: text })} />
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
  const { scene, copy, edit, visible, toggle, layouts, position, extraKeys } = useGraphics();
  return <section className="wxg-menu" aria-label="Graphics">
    <div className="panel-heading">GRAPHICS</div>
    <button onClick={()=>{if(!visible.title)toggle('title');}}>Add / show title bar</button>
    <button onClick={()=>{edit({manual:false});if(!visible.title)toggle('title');}}>Refresh title from scene</button>
    <BarLibrary value={copy.barStyles} onChange={barStyles => edit({ barStyles })} targets={['title', 'lower', 'ticker']} disabled={!scene} />
    {(['title', 'lower', 'ticker'] as Kind[]).map(kind => <label key={kind} className="wxg-toggle"><span>{kind === 'title' ? 'Title bar' : kind === 'lower' ? 'Lower third' : 'Ticker'}</span><input type="checkbox" checked={visible[kind]} onChange={() => toggle(kind)} /></label>)}
    <label>Title text<select aria-label="Title text" value={copy.manual ? 'blank' : 'scene'} onChange={event => edit(event.target.value === 'blank' ? { manual: true, title: '' } : { manual: false })}><option value="scene">Match scene</option><option value="blank">Blank / add text</option></select></label>
    <label>Title<input value={titleText(scene, copy)} onChange={event => edit({ manual: true, title: event.target.value })} /></label>
    <label>Title bar size<input aria-label="Title bar size" type="range" min="25" max="100" value={Math.round((copy.barBoxes?.title?.fontScale??layouts.title.scale) * 100)} onChange={event => { const scale=Number(event.target.value)/100; const box=copy.barBoxes?.title; if(box){const factor=scale/(box.fontScale??1);edit({barBoxes:{...copy.barBoxes,title:{...box,width:Math.min(100-box.x,box.width*factor),height:Math.min(100-box.y,(box.height??10)*factor),fontScale:scale}}});}else position('title',{...layouts.title,scale}); }} /></label>
    <KeysMenu extraKeys={extraKeys} selection={copy.keySelection ?? 'auto'} weatherKeyId={scene?.weatherKeyId} disabled={!scene} choose={keySelection => { edit({ keySelection }); if (keySelection !== 'none' && resolveWeatherKey(keySelection, scene?.weatherKeyId, extraKeys) && !visible.title) toggle('title'); }} />
    {visible.lower && <label>Lower third text<input value={copy.lower} onChange={event => edit({ lower: event.target.value })} /></label>}
    {visible.ticker && <label>Ticker text<input value={copy.ticker} onChange={event => edit({ ticker: event.target.value })} /></label>}
  </section>;
}
