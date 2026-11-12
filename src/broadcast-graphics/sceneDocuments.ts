import {useCallback, useSyncExternalStore} from 'react';

// One versioned envelope for every editable scene family. Live weather never enters history.
const STORAGE = 'rbrwx.scene-documents.v1';
const LIMIT = 50;
export interface Entry<T> {value:T; past:T[]; future:T[]; saved?:T; stamp:number}
type Documents = Record<string, Entry<unknown>>;
let documents:Documents|undefined;
const listeners = new Set<()=>void>();
let writeTimer:ReturnType<typeof setTimeout>|undefined;
let dragging=false;
if(typeof window!=='undefined'){
 window.addEventListener('pointerdown',()=>{dragging=true;},true);
 window.addEventListener('pointerup',()=>{dragging=false;},true);
 window.addEventListener('pointercancel',()=>{dragging=false;},true);
 window.addEventListener('blur',()=>{dragging=false;flush();});
 window.addEventListener('pagehide',flush);
}
function flush(){
 if(writeTimer)clearTimeout(writeTimer);
 try{const entries=Object.fromEntries(Object.entries(read()).map(([key,e])=>[key,{...e,past:e.past.slice(-12),future:e.future.slice(0,12)}]));localStorage.setItem(STORAGE,JSON.stringify({schema:1,entries}));}catch{/* An unavailable store must not disable editing. */}
}
function read():Documents {
  if (documents) return documents;
  try {const raw=JSON.parse(localStorage.getItem(STORAGE)??'null');documents=raw?.schema===1&&raw.entries&&typeof raw.entries==='object'&&!Array.isArray(raw.entries)?Object.fromEntries(Object.entries(raw.entries).filter(([,entry])=>!!entry&&typeof entry==='object'&&Array.isArray((entry as Entry<unknown>).past)&&Array.isArray((entry as Entry<unknown>).future)&&'value' in entry)) as Documents:{};} catch {documents={};}
  return documents!;
}
// All editors share persistence, but changing a title must not invalidate
// snapshots for unrelated forecast, layer-preset, or EWX controls.
const scopeViews = new Map<string,Record<string,unknown>>();
function scopeView<T>(scope:string):Record<string,T> {
  let view=scopeViews.get(scope);
  if(!view){
    view=Object.fromEntries(Object.entries(read()).filter(([key])=>key.startsWith(scope+':')&&!key.endsWith(':__migrated')).map(([key,e])=>[key.slice(scope.length+1),e.value]));
    scopeViews.set(scope,view);
  }
  return view as Record<string,T>;
}
function publish(next:Documents,scope:string) {
  documents=next;scopeViews.delete(scope);
  if(writeTimer)clearTimeout(writeTimer);writeTimer=setTimeout(flush,250);
  listeners.forEach(fn=>fn());
}
export function changeEntry<T>(entry:Entry<T>,value:T,now=Date.now(),group=false):Entry<T> {
  if(Object.is(value,entry.value)||JSON.stringify(value)===JSON.stringify(entry.value))return entry;
  return {value,past:group&&now-entry.stamp<400?entry.past:[...entry.past,entry.value].slice(-LIMIT),future:[],saved:entry.saved,stamp:now};
}
export type HistoryAction='undo'|'redo'|'save'|'restore'|'reset';
export function historyEntry<T>(entry:Entry<T>,action:HistoryAction,initial:T):Entry<T> {
  if(action==='save')return {...entry,saved:structuredClone(entry.value),stamp:0};
  if(action==='reset')return changeEntry({...entry,stamp:0},initial);
  if(action==='restore')return entry.saved===undefined?entry:changeEntry({...entry,stamp:0},structuredClone(entry.saved));
  if(action==='undo'&&entry.past.length)return {...entry,value:entry.past.at(-1)!,past:entry.past.slice(0,-1),future:[entry.value,...entry.future].slice(0,LIMIT),stamp:0};
  if(action==='redo'&&entry.future.length)return {...entry,value:entry.future[0],past:[...entry.past,entry.value].slice(-LIMIT),future:entry.future.slice(1),stamp:0};
  return entry;
}
export function useSceneRecords<T>(scope:string,legacy:()=>Record<string,T>) {
  // Import legacy values once; retain the original storage for recovery.
  if(!Object.hasOwn(read(),`${scope}:__migrated`)) {
    const next={...read()};for(const[id,value]of Object.entries(legacy()))next[`${scope}:${id}`]??={value,past:[],future:[],stamp:0};
    next[`${scope}:__migrated`]={value:true,past:[],future:[],stamp:0};documents=next;
  }
  const getSnapshot=useCallback(()=>scopeView<T>(scope),[scope]);
  const records=useSyncExternalStore(useCallback(fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},[]),getSnapshot,getSnapshot);
  const set=useCallback((update:Record<string,T>|((old:Record<string,T>)=>Record<string,T>))=>{
    const base=read(),old=scopeView<T>(scope);
    const values=typeof update==='function'?update(old):update,next={...base};let changed=false;
    for(const[id,value]of Object.entries(values)){const key=`${scope}:${id}`,entry=base[key] as Entry<T>|undefined;const after=entry?changeEntry(entry,value,Date.now(),dragging):{value,past:[],future:[],stamp:0};if(after!==entry){next[key]=after;changed=true;}}
    if(changed)publish(next,scope);
  },[scope]);
  const history=useCallback((id:string,action:HistoryAction,initial:T)=>{const key=`${scope}:${id}`,entry=(read()[key] as Entry<T>)??{value:initial,past:[],future:[],stamp:0};publish({...read(),[key]:historyEntry(entry,action,initial)},scope);},[scope]);
  return [records,set,history] as const;
}
