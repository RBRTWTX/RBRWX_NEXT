import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import type { Map as WeatherMap } from 'maplibre-gl';
import { CurrentWeatherController } from './controller';
import { defaultOptions, freshness, initialSnapshot, temperature, wind, type Options, type Product, type Snapshot } from './model';
import './weather.css';
interface Runtime { product:Product; snapshot:Snapshot; options:Options; edit:(patch:Partial<Options>)=>void; controller:CurrentWeatherController;  }
const Context=createContext<Runtime|null>(null);
export function useCurrentWeather(){const value=useContext(Context);if(!value)throw Error('Current weather provider missing');return value;}
export function CurrentWeatherProvider({sceneId,product,children}:{sceneId:string;product:Product;children:ReactNode}){
  const[snapshot,setSnapshot]=useState(initialSnapshot),[settings,setSettings]=useState<Record<string,Options>>({});
  const controller=useMemo(()=>new CurrentWeatherController(setSnapshot),[]),options=settings[sceneId]??defaultOptions();
  useLayoutEffect(()=>{controller.select(sceneId,product,options,'');},[controller,sceneId,product,options.units,options.opacity,options.loop]);
  useEffect(()=>()=>controller.destroy(),[controller]);
  return <Context.Provider value={{product,snapshot,options,controller,edit:patch=>setSettings(old=>({...old,[sceneId]:{...(old[sceneId]??defaultOptions()),...patch}}))}}>{children}</Context.Provider>;
}
export function WeatherMapConnection({children}:{children:(connect:(map:WeatherMap)=>()=>void)=>ReactNode}){
  const{controller}=useCurrentWeather();return children(map=>controller.connect(map,'rbrwx-county-boundary'));
}
export function WeatherControls(){
  const{product,snapshot,options,edit,controller}=useCurrentWeather();
  return <section className="wx-current-controls" aria-label="Current weather">
    {product!=='map'&&<><div className="panel-heading">CURRENT WEATHER</div><p role="status">{snapshot.message}</p>
      <label><input type="checkbox" checked={options.units==='metric'} onChange={e=>edit({units:e.target.checked?'metric':'imperial'})}/> Metric units</label>
      <label>Weather opacity<input aria-label="Weather opacity" type="range" min="0" max="100" value={Math.round(options.opacity*100)} onChange={e=>edit({opacity:Number(e.target.value)/100})}/></label>
      <button type="button" onClick={()=>void controller.refresh()}>Refresh weather</button>
      {product==='observations'&&<div className="wx-observations">{snapshot.observations.map(o=><article key={o.id}><strong>{o.id} · {o.name}</strong><div>{temperature(o.temperature,options.units)} · {o.description}</div><div>Dew point {temperature(o.dewpoint,options.units)}</div><div>Wind {wind(o.wind,options.units)} · Gust {wind(o.gust,options.units)}</div><small>{freshness(o.time,90,o.cached).toUpperCase()} · {new Date(o.time).toLocaleString()}</small></article>)}</div>}
    </>}
    <p className="wx-public-source">Public NOAA/NWS data · No API key required</p>
  </section>;
}
export function WeatherPlayback(){const{product,snapshot,options,edit,controller}=useCurrentWeather();if(product!=='radar'&&product!=='satellite')return null;
  const disabled=snapshot.times.length<2;return <div className="wx-weather-playback" aria-label="Weather imagery playback">
    <button type="button" aria-label="Previous weather frame" disabled={disabled} onClick={()=>controller.step(-1)}>Previous</button>
    <button type="button" disabled={disabled} onClick={()=>controller.play()}>{snapshot.playing?'Pause weather':'Play weather'}</button>
    <button type="button" aria-label="Next weather frame" disabled={disabled} onClick={()=>controller.step(1)}>Next</button>
    <label><input type="checkbox" checked={options.loop} onChange={e=>edit({loop:e.target.checked})}/> Loop</label>
    <button type="button" disabled={!snapshot.times.length} onClick={()=>{controller.stop();void controller.seek(snapshot.times[snapshot.times.length-1]);}}>Latest</button>
    <input aria-label="Weather frame" type="range" min="0" max={Math.max(0,snapshot.times.length-1)} disabled={disabled} value={Math.max(0,snapshot.times.indexOf(snapshot.selectedTime??0))} onChange={e=>{controller.stop();void controller.seek(snapshot.times[Number(e.target.value)]);}}/>
    <span>{snapshot.time?new Date(snapshot.time).toLocaleTimeString():'No image loaded'}</span>
  </div>;
}
export function WeatherStatus(){const{product,snapshot}=useCurrentWeather();return product==='map'?null:<div className="wx-weather-status" role="status">{snapshot.message}</div>;}
