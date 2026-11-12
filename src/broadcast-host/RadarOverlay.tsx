import {createContext,useContext,useEffect,useLayoutEffect,useMemo,useState,type ReactNode} from 'react';
import type {Map as WeatherMap} from 'maplibre-gl';
import {useBroadcast} from '../broadcast';
import {CurrentWeatherController} from '../current-weather/controller';
import {defaultOptions,initialSnapshot,type Options,type Snapshot} from '../current-weather/model';

interface RadarState {
 enabled:boolean; toggle:()=>void; setEnabled:(enabled:boolean)=>void;
 options:Options; edit:(patch:Partial<Options>)=>void; snapshot:Snapshot;
 controller:CurrentWeatherController; connect:(map:WeatherMap)=>()=>void;
}
const Context=createContext<RadarState|null>(null);
export function useRadarOverlay(){const value=useContext(Context);if(!value)throw Error('Radar overlay provider missing');return value;}
export function RadarOverlayProvider({children}:{children:ReactNode}){
 const {programScene}=useBroadcast();
 const scene=programScene?.id??'startup';
 const [overrides,setOverrides]=useState<Record<string,boolean>>({});
 const enabled=overrides[scene]??programScene?.contentKey==='current.radar';
 const [options,setOptions]=useState(defaultOptions);
 const [snapshot,setSnapshot]=useState(initialSnapshot);
 // Radar owns only its imagery layers. It must never clear observation sources.
 const controller=useMemo(()=>new CurrentWeatherController(setSnapshot,undefined,false),[]);
 useLayoutEffect(()=>controller.select('independent-radar',enabled?'radar':'map',options,''),[controller,enabled,options]);
 useEffect(()=>()=>controller.destroy(),[controller]);
 const setEnabled=(value:boolean)=>setOverrides(old=>({...old,[scene]:value}));
 return <Context.Provider value={{enabled,toggle:()=>setEnabled(!enabled),setEnabled,options,edit:patch=>setOptions(old=>({...old,...patch})),snapshot,controller,connect:map=>{const release=controller.connect(map,'rbrwx-county-boundary');let sorting=false;const order=()=>{if(sorting)return;const ids=map.getLayersOrder(),radar=ids.filter(id=>id.startsWith('rbrwx-radar-')),anchor=ids.indexOf('rbrwx-county-boundary');if(!radar.length||anchor<0)return;const desired=ids.filter(id=>!radar.includes(id));desired.splice(desired.indexOf('rbrwx-county-boundary'),0,...radar);if(ids.join('|')===desired.join('|'))return;sorting=true;try{radar.forEach(id=>map.moveLayer(id,'rbrwx-county-boundary'));}finally{sorting=false;}};map.on('styledata',order);return()=>{map.off('styledata',order);release();};}}}>{children}</Context.Provider>;
}

// Graphic scenes keep their cards and typography; only radar is drawn above them.
// The original layer visibility is restored when leaving the graphic scene.
export function useGraphicRadarMap(map:WeatherMap|null,active:boolean){
 useLayoutEffect(()=>{
  if(!map||!active)return;
  const previous=new Map<string,'visible'|'none'>();
  let applying=false;
  const hide=()=>{if(applying)return;applying=true;try{
   for(const id of map.getLayersOrder()){
    if(id.startsWith('rbrwx-radar-')||id.startsWith('rbrwx-public-'))continue;
    if(!previous.has(id))previous.set(id,map.getLayoutProperty(id,'visibility') as 'visible'|'none'??'visible');
    if(map.getLayoutProperty(id,'visibility')!=='none')map.setLayoutProperty(id,'visibility','none');
   }
  }finally{applying=false;}};
  hide();map.on('styledata',hide);
  return()=>{map.off('styledata',hide);for(const[id,visibility]of previous)if(map.getLayer(id))map.setLayoutProperty(id,'visibility',visibility);};
 },[map,active]);
}
