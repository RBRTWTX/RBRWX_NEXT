import{createContext,useContext,useEffect,useMemo,useRef,useState,type ReactNode}from'react';
import type{Map as WeatherMap}from'maplibre-gl';
import{useBroadcast}from'../broadcast';
import{useSynoptic}from'./Scene';
import{SynopticRuntime}from'./runtime';
import{PRODUCTS,defaults,emptyPack,type PackSnapshot}from'./model';
import{bearing,cityTimings,destination,type LonLat,type City}from'./tracking';
export const OVERLAYS=[{id:'warnings',label:'Warnings',product:'warnings'},{id:'lightning',label:'Lightning',product:'glm-flashes'},{id:'cone',label:'Track / cone',product:'tropical-cone'},{id:'surge',label:'Storm surge watches / warnings',product:'surge'}] as const;
type Mode='none'|'pen'|'track';
export interface Stroke{points:LonLat[];color:string;width:number}
export interface ToolState{strokes:Stroke[];track:LonLat[];mph:number;time:number}
export interface ToolsSnapshot{overlays:PackSnapshot[];objects:ToolState}
const fresh=():ToolState=>({strokes:[],track:[],mph:30,time:0});
interface Model{snapshot:ToolsSnapshot;enabled:Record<string,boolean>;setEnabled:(value:Record<string,boolean>)=>void;toggle:(id:string)=>void;mode:Mode;setMode:(mode:Mode)=>void;edit:(patch:Partial<ToolState>)=>void;color:string;setColor:(color:string)=>void;refresh:()=>void}
const Context=createContext<Model|null>(null);
export function useOnAirTools(){const c=useContext(Context);if(!c)throw Error('On-air tools missing');return c;}
export function OnAirProvider({children}:{children:ReactNode}){
 const{map}=useSynoptic(),{state,programScene}=useBroadcast(),scene=`${programScene?.id??'startup'}:${state.programItemId??'direct'}`;
 const[byScene,setByScene]=useState<Record<string,ToolState>>(()=>{try{return JSON.parse(localStorage.getItem('rbrwx-onair-objects-v1')??'{}')??{};}catch{return{};}});
 const objects=byScene[scene]??fresh(),[enabled,setEnabled]=useState<Record<string,boolean>>({}),[mode,setMode]=useState<Mode>('none'),[color,setColor]=useState('#fff000'),[overlays,setOverlays]=useState<PackSnapshot[]>(()=>OVERLAYS.map(()=>emptyPack()));
 const controllers=useMemo(()=>OVERLAYS.map((layer,i)=>new SynopticRuntime(value=>setOverlays(old=>old.map((s,j)=>i===j?value:s)),`rbrwx-onair-${layer.id}`)),[]);
 useEffect(()=>{try{localStorage.setItem('rbrwx-onair-objects-v1',JSON.stringify(byScene));}catch{}},[byScene]);
 useEffect(()=>{setMode('none');setEnabled({});},[scene]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setMode('none');};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
 useEffect(()=>{if(!map)return;const release=controllers.map(c=>c.connect(map));return()=>release.forEach(f=>f());},[map,controllers]);
 useEffect(()=>{controllers.forEach((c,i)=>c.select(enabled[OVERLAYS[i].id]?PRODUCTS.find(p=>p.id===OVERLAYS[i].product)!:null,{...defaults(),opacity:.6,labels:OVERLAYS[i].id==='cone'}));},[enabled,controllers]);
 useEffect(()=>{const timer=setInterval(()=>controllers.forEach((c,i)=>{if(enabled[OVERLAYS[i].id])void c.refresh();}),60000);return()=>clearInterval(timer);},[controllers,enabled]);
 return <Context.Provider value={{snapshot:{overlays,objects},enabled,setEnabled,toggle:id=>setEnabled(old=>({...old,[id]:!old[id]})),mode,setMode,color,setColor,edit:patch=>setByScene(old=>({...old,[scene]:{...(old[scene]??fresh()),...patch}})),refresh:()=>controllers.forEach((c,i)=>{if(enabled[OVERLAYS[i].id])void c.refresh();})}}>{children}</Context.Provider>;
}
export function OnAirDrawing({map,snapshot,live=false}:{map:WeatherMap|null;snapshot:ToolsSnapshot;live?:boolean}){
 const context=useContext(Context),mode=live?context?.mode??'none':'none',[,tick]=useState(0),[draft,setDraft]=useState<LonLat[]>([]),drawing=useRef<LonLat[]|null>(null);
 useEffect(()=>{if(!map)return;const update=()=>tick(n=>n+1);map.on('move',update);map.on('idle',update);return()=>{map.off('move',update);map.off('idle',update);};},[map]);
 useEffect(()=>{setDraft([]);drawing.current=null;},[mode]);
 if(!map)return null;
 const objects=snapshot.objects,project=(p:LonLat)=>{const q=map.project(p);return`${q.x},${q.y}`;},point=(e:{clientX:number;clientY:number})=>{const r=map.getCanvas().getBoundingClientRect(),p=map.unproject([e.clientX-r.left,e.clientY-r.top]);return[p.lng,p.lat]as LonLat;};
 const cities:City[]=[];if(objects.track.length===2){const layers=map.getStyle().layers.filter(l=>l.id.startsWith('rbrwx-city-')).map(l=>l.id);if(layers.length)for(const f of map.queryRenderedFeatures({layers})){if(f.geometry.type!=='Point')continue;const name=String(f.properties?.['name:en']??f.properties?.name??'');if(name)cities.push({name,point:f.geometry.coordinates.slice(0,2)as LonLat});}}
 const validTrack=objects.track.length===2&&objects.mph>0,estimates=validTrack?cityTimings(objects.track[0],objects.track[1],objects.mph,cities):[],direction=validTrack?bearing(objects.track[0],objects.track[1]):0,end=validTrack?destination(objects.track[0],direction,objects.mph*1.609344*.5):null;
 return <><svg className="onair-drawing" style={{pointerEvents:mode==='none'?'none':'auto',cursor:mode==='none'?undefined:'crosshair'}}
 onPointerDown={e=>{if(!context||e.button!==0)return;e.stopPropagation();const p=point(e);if(mode==='track'){const next=draft.length?[draft[0],p]:[p];setDraft(next);if(next.length===2){context.edit({track:next,time:Date.now()});context.setMode('none');}return;}if(mode==='pen'){drawing.current=[p];setDraft([p]);e.currentTarget.setPointerCapture(e.pointerId);}}}
 onPointerMove={e=>{if(mode==='pen'&&drawing.current&&drawing.current.length<2000){drawing.current=[...drawing.current,point(e)];setDraft(drawing.current);}}}
 onPointerUp={e=>{if(context&&drawing.current){context.edit({strokes:[...objects.strokes.slice(-49),{points:drawing.current,color:context.color,width:4}]});drawing.current=null;setDraft([]);}if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
 onPointerCancel={()=>{drawing.current=null;setDraft([]);}}>
 {objects.strokes.map((stroke,i)=><polyline key={i} points={stroke.points.map(project).join(' ')} fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round"/>)}
 {!!draft.length&&<polyline points={draft.map(project).join(' ')} fill="none" stroke={context?.color??'white'} strokeWidth="4"/>}
 {validTrack&&end&&<><defs><marker id="onair-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#ffff70"/></marker></defs><polyline points={[objects.track[0],end].map(project).join(' ')} fill="none" stroke="#ffff70" strokeWidth="4" markerEnd="url(#onair-arrow)"/>{[10,20,30].map(min=>{const p=map.project(destination(objects.track[0],direction,objects.mph*1.609344*min/60));return <text key={min} x={p.x} y={p.y-10} fill="white" stroke="#122238" strokeWidth="3" paintOrder="stroke" fontSize="16">{min} min</text>;})}</>}
 </svg>{mode!=='none'&&<div className="onair-tool-hint">{mode==='pen'?'PEN · drag to draw':'TRACK · click origin, then direction'} · Escape to finish</div>}{validTrack&&<aside className="onair-timings"><strong>OPERATOR ESTIMATE · {Math.round(direction)}° / {objects.mph} mph</strong><small>Track origin {new Date(objects.time).toLocaleTimeString()} · visible cities within 15 km of projected path</small>{estimates.length?estimates.map(city=><div key={city.name}>{city.name} · {Math.round(city.minutes)} min · {new Date(objects.time+city.minutes*60000).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</div>):<div>No mapped cities in the projected path at this zoom.</div>}</aside>}</>;
}
export function LiveOnAirDrawing(){const{map}=useSynoptic(),tools=useOnAirTools();return <OnAirDrawing map={map} snapshot={tools.snapshot} live/>;}
export function OnAirCapture({map,snapshot}:{map:WeatherMap|null;snapshot:ToolsSnapshot}){
 const controllers=useMemo(()=>OVERLAYS.map(layer=>new SynopticRuntime(()=>{},`rbrwx-onair-${layer.id}`)),[]);
 useEffect(()=>{if(!map)return;const release=controllers.map(c=>c.connect(map));return()=>release.forEach(f=>f());},[map,controllers]);
 useEffect(()=>{if(map)controllers.forEach((c,i)=>c.renderSnapshot(snapshot.overlays[i]??emptyPack()));},[map,controllers,snapshot.overlays]);
 return <OnAirDrawing map={map} snapshot={snapshot}/>;
}
