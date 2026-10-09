import {ForecastLocationControls} from '../forecast-graphics/ForecastGraphics';
import {useSceneRecords,type HistoryAction} from '../broadcast-graphics/sceneDocuments';
import {isOperatorCommand} from './operatorCommands';
import {useRadarOverlay} from './RadarOverlay';
import {useForecastGraphics} from './ForecastGraphicsHost';
import{ToolIcon,IconButton}from'./OnAirIcons';
import{useBroadcast}from'../broadcast';
import{useQpf}from'./QpfHost';
import{useCurrentWeather}from'../current-weather/CurrentWeather';
import{useEwxAlerts}from'../current-weather/EwxAlerts';
import{useGraphics}from'../broadcast-graphics/Graphics';
import{useSynoptic}from'../synoptic/Scene';
import{OVERLAYS,useOnAirTools}from'../synoptic/OnAirTools';
import{PRODUCTS}from'../synoptic/model';
import type{Options}from'../current-weather/model';
import'./onAirMenu.css';
interface LayerPreset {name:string;center:[number,number];zoom:number;bearing:number;pitch:number;radar:boolean;radarOptions:Options;radarSite:string|null;weather:ReturnType<typeof useCurrentWeather>['product'];weatherOptions:Options;product:string|null;overlays:Record<string,boolean>;ewx:boolean;qpf:boolean;qpfOpacity:number}
export function useLayerPresets(){const {programScene}=useBroadcast();const [presets]=useSceneRecords<LayerPreset>(`layer-presets:${programScene?.id??'startup'}`,()=>({}));return Object.fromEntries(Object.entries(presets).map(([id,p])=>[id,p.name]));}
export function useOnAirCommands(){const broadcast=useBroadcast(),qpf=useQpf(),radar=useRadarOverlay(),forecast=useForecastGraphics(),weather=useCurrentWeather(),synoptic=useSynoptic(),tools=useOnAirTools(),graphics=useGraphics(),ewx=useEwxAlerts();
 const [presets,setPresets]=useSceneRecords<LayerPreset>(`layer-presets:${broadcast.programScene?.id??'startup'}`,()=>({}));
 return(command:string):boolean=>{
 if(!isOperatorCommand(command))return false;
 if(command.startsWith('edit:')){const action=command.slice(5) as HistoryAction; (forecast.active?forecast.history:synoptic.active?synoptic.history:graphics.history)(action);return true;}
 if(command.startsWith('preset:')){
   const [,action,id]=command.split(':'),map=synoptic.map;
   if(action==='save'&&map){const center=map.getCenter();setPresets(old=>({...old,[id]:{name:broadcast.programScene?.title??'View',center:[center.lng,center.lat],zoom:map.getZoom(),bearing:map.getBearing(),pitch:map.getPitch(),radar:radar.enabled,radarOptions:radar.options,radarSite:radar.snapshot.primaryRadarId,weather:weather.product,weatherOptions:weather.options,product:synoptic.snapshot.productId,overlays:tools.enabled,ewx:ewx.state.enabled,qpf:qpf.enabled,qpfOpacity:qpf.opacity}}));}
   if(action==='load'&&presets[id]){const p=presets[id];radar.edit(p.radarOptions);radar.setEnabled(p.radar);if(p.radarSite)void radar.controller.setPrimaryRadar(p.radarSite);weather.setProduct(p.weather);weather.edit(p.weatherOptions);synoptic.setProduct(p.product);tools.setEnabled(p.overlays);ewx.edit({enabled:p.ewx});qpf.setEnabled(p.qpf);qpf.editOpacity(p.qpfOpacity);requestAnimationFrame(()=>requestAnimationFrame(()=>map?.jumpTo({center:p.center,zoom:p.zoom,bearing:p.bearing,pitch:p.pitch})));}return true;
 }
 if(command.startsWith('radar-site:')){void radar.controller.setPrimaryRadar(command.slice(11));return true;}
 const imagery=radar.enabled?radar:['radar','satellite'].includes(weather.product)?weather:null, useSyn=synoptic.active&&!radar.enabled;
 if(['previous','next','play-pause','loop','refresh','latest'].includes(command)||command.startsWith('seek:')){
  if(command==='refresh')void(radar.enabled?radar.controller.refresh():useSyn?synoptic.controller.refresh():qpf.active?qpf.controller.refresh():forecast.active?forecast.refreshData():weather.controller.refresh());
  else if(command==='previous'||command==='next'){const n=command==='previous'?-1:1;if(useSyn)synoptic.step(n);else if(imagery)imagery.controller.step(n);else if(n<0)broadcast.previous();else broadcast.next();}
  else if(command==='play-pause'){if(useSyn)synoptic.play();else if(imagery)imagery.controller.play();else if(broadcast.state.transport==='playing')broadcast.pause();else broadcast.play();}
  else if(command==='loop'){if(useSyn)synoptic.edit({loop:!synoptic.snapshot.settings.loop});else if(imagery)imagery.edit({loop:!imagery.options.loop});else broadcast.setLoop(!broadcast.state.loop);}
  else if(command==='latest'){if(useSyn)void synoptic.controller.loadFrame(synoptic.snapshot.frames.length-1);else if(imagery&&imagery.snapshot.times.length){imagery.controller.stop();void imagery.controller.seek(imagery.snapshot.times.at(-1)!);}}
  else {const index=Number(command.slice(5));if(useSyn&&synoptic.snapshot.frames[index])void synoptic.controller.loadFrame(index);else if(imagery&&imagery.snapshot.times[index]){imagery.controller.stop();void imagery.controller.seek(imagery.snapshot.times[index]);}}return true;
 }

 if(command==='bar-add'){if(forecast.active){forecast.showTitle();}else if(synoptic.active)synoptic.edit({titleVisible:true});else if(!graphics.visible.title)graphics.toggle('title');return true;}
 if(command==='bar-refresh'){if(forecast.active){forecast.showTitle(true);}else if(synoptic.active){const{title,time,...rest}=synoptic.snapshot.settings.textOverrides??{};synoptic.edit({titleVisible:true,title:'',textOverrides:rest});}else{graphics.edit({manual:false});if(!graphics.visible.title)graphics.toggle('title');}return true;}
 if(command==='ewx-toggle'){ewx.edit({enabled:!ewx.state.enabled});return true;}
 if(command==='ewx-refresh'){ewx.refresh();return true;}
 if(command==='radar-toggle'){radar.toggle();return true;}
 if(command==='radar-off'){radar.setEnabled(false);return true;}
 if(command==='sweeps'){radar.edit({sweepsEnabled:!radar.options.sweepsEnabled});return true;}
 if(command==='pen'){tools.setMode(tools.mode==='pen'?'none':'pen');return true;}
 if(command==='track'){tools.setMode(tools.mode==='track'?'none':'track');return true;}
 if(command==='pen-undo'){tools.edit({strokes:tools.snapshot.objects.strokes.slice(0,-1)});return true;}
 if(command==='pen-clear'){tools.edit({strokes:[]});return true;}
 if(command==='track-clear'){tools.edit({track:[]});return true;}
 if(command.startsWith('speed:')){const mph=Number(command.slice(6));if(Number.isFinite(mph)&&mph>=1&&mph<=150)tools.edit({mph});return true;}
 if(command.startsWith('color:')){const color=command.slice(6);if(/^#[a-f0-9]{6}$/i.test(color))tools.setColor(color);return true;}
 if(command.startsWith('overlay:')){const id=command.slice(8);if(OVERLAYS.some(p=>p.id===id))tools.toggle(id);return true;}
 if(command.startsWith('radar:')){const field=command.slice(6);if(['reflectivity','velocity','hydro'].includes(field)){radar.setEnabled(true);radar.edit({radarField:field as Options['radarField'],mrmsEnabled:false});}return true;}
 if(command.startsWith('satellite:')){const feed=command.slice(10);if(['longwave','shortwave','visible','water_vapor','snow_ice'].includes(feed)){synoptic.setProduct(null);weather.setProduct('satellite');weather.edit({satelliteFeed:feed as Options['satelliteFeed']});}return true;}
 if(command.startsWith('mrms:')){const id=command.slice(5);if(PRODUCTS.some(p=>p.id===id&&p.family==='mrms')){weather.setProduct('map');synoptic.setProduct(id);}return true;}
 if(command==='layers-off'){radar.setEnabled(false);if(qpf.active)qpf.setEnabled(false);for(const id of Object.keys(tools.enabled))if(tools.enabled[id])tools.toggle(id);weather.setProduct('map');synoptic.setProduct(null);return true;}
 if(command==='overlays-refresh'){tools.refresh();return true;}
 return false;
};}
export function BroadcastToolButtons({command,ewx=false,enabled={},draw=true,radar=false,sweeps=false,presets={}}:{command:(value:string)=>void;ewx?:boolean;enabled?:Record<string,boolean>;draw?:boolean;radar?:boolean;sweeps?:boolean;presets?:Record<string,string>}){
 const summary=(icon:string,label:string)=><><ToolIcon name={icon}/><span>{label}</span></>;
 const exclusive=(e:React.SyntheticEvent<HTMLDetailsElement>)=>{if(e.currentTarget.open)e.currentTarget.parentElement?.querySelectorAll(':scope > details').forEach(node=>{if(node!==e.currentTarget)(node as HTMLDetailsElement).open=false;});};
 return <div className="onair-toolbar" aria-label="Broadcast tools">
 <IconButton icon="add" label="Add / show title bar" short="Title" onClick={()=>command('bar-add')}/><IconButton icon="refresh" label="Refresh title from scene" short="Title" onClick={()=>command('bar-refresh')}/>
 <details onToggle={exclusive}><summary>Edit history</summary><div className="onair-submenu">{(['undo','redo','save','restore','reset'] as const).map(a=><button key={a} onClick={()=>command(`edit:${a}`)}>{a==='save'?'Save point':a}</button>)}</div></details>
 <details onToggle={exclusive}><summary>Scene view presets</summary><div className="onair-submenu">{[1,2,3,4,5,6].map(id=><div key={id}><button disabled={!presets[id]} onClick={()=>command(`preset:load:${id}`)}>{id}: {presets[id]??'Empty'}</button><button onClick={()=>command(`preset:save:${id}`)}>Save {id}</button></div>)}</div></details>
 <IconButton icon="alerts" label={`EWX alert scroll ${ewx?'on':'off'}`} short="EWX" aria-pressed={ewx} onClick={()=>command('ewx-toggle')}/>
 {OVERLAYS.map(item=><IconButton key={item.id} icon={item.id==='warnings'?'warning':item.id==='cone'?'cone':item.id==='surge'?'surge':'lightning'} label={item.label} short={item.id==='warnings'?'Warn':item.id==='cone'?'Cone':item.id==='surge'?'Surge':'GLM'} aria-pressed={enabled[item.id]??false} onClick={()=>command(`overlay:${item.id}`)}/>)}
 <IconButton icon="radar" label="Toggle radar overlay" short="Radar" aria-pressed={radar} onClick={()=>command('radar-toggle')}/><IconButton icon="sweep" label="Toggle radar sweeps" short="Sweep" aria-pressed={sweeps} onClick={()=>command('sweeps')}/><IconButton icon="refresh" label="Refresh overlays" short="Layers" onClick={()=>command('overlays-refresh')}/>
 <details onToggle={exclusive}><summary title="Radar products" aria-label="Radar products">{summary('radar','Radar')}</summary><div className="onair-submenu">
 <button title="Turn radar off" onClick={()=>command('radar-off')}>OFF</button><button title="Site reflectivity" onClick={()=>command('radar:reflectivity')}>REF</button><button title="Radial velocity" onClick={()=>command('radar:velocity')}>VEL</button><button title="Hydrometeor classification" onClick={()=>command('radar:hydro')}>HCA</button>
 <label>MRMS<select aria-label="MRMS product" defaultValue="" onChange={e=>{if(e.target.value)command(`mrms:${e.target.value}`);e.target.value='';}}><option value="">Choose layer…</option>{PRODUCTS.filter(p=>p.family==='mrms').map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
 </div></details>
 <details onToggle={exclusive}><summary title="Satellite feeds" aria-label="Satellite feeds">{summary('satellite','Sat')}</summary><div className="onair-submenu">{[['longwave','IR','Longwave infrared'],['visible','VIS','Visible'],['water_vapor','WV','Water vapor'],['shortwave','SWIR','Shortwave infrared'],['snow_ice','Snow','Snow / ice']].map(([id,label,full])=><button key={id} title={full} aria-label={full} onClick={()=>command(`satellite:${id}`)}>{label}</button>)}</div></details>
 <details onToggle={exclusive}><summary title="Drawing tools" aria-label="Drawing tools">{summary('pen','Draw')}</summary><div className="onair-submenu"><IconButton icon="pen" label="Pen on / off" short="Pen" disabled={!draw} onClick={()=>command('pen')}/><IconButton icon="undo" label="Undo stroke" short="Undo" onClick={()=>command('pen-undo')}/><IconButton icon="clear" label="Clear ink" short="Clear" onClick={()=>command('pen-clear')}/><label>Color<input aria-label="Pen color" type="color" defaultValue="#fff000" onChange={e=>command(`color:${e.target.value}`)}/></label>{!draw&&<small>Draw on the operator canvas.</small>}</div></details>
 <details onToggle={exclusive}><summary title="Storm direction and city timing" aria-label="Storm tracking tools">{summary('track','Track')}</summary><div className="onair-submenu"><IconButton icon="track" label="Place direction: click origin, then ahead" short="Place" disabled={!draw} onClick={()=>command('track')}/><IconButton icon="clear" label="Clear track" short="Clear" onClick={()=>command('track-clear')}/><label>mph<input aria-label="Storm speed (mph)" type="number" min="1" max="150" defaultValue="30" onChange={e=>command(`speed:${e.target.value}`)}/></label><small>Operator estimate · visible cities near path.</small></div></details>
 <IconButton icon="off" label="Weather layer off" short="Off" onClick={()=>command('layers-off')}/><IconButton icon="refresh" label="Refresh EWX alerts" short="EWX" onClick={()=>command('ewx-refresh')}/>
 </div>;
}
export interface PlaybackState {playing:boolean;loop:boolean;disabled:boolean;count:number;index:number}
export function usePlaybackState():PlaybackState {const r=useRadarOverlay(),s=useSynoptic(),w=useCurrentWeather(),b=useBroadcast();if(r.enabled)return {playing:r.snapshot.playing,loop:r.options.loop,disabled:r.snapshot.times.length<2,count:r.snapshot.times.length,index:Math.max(0,r.snapshot.times.indexOf(r.snapshot.selectedTime??0))};if(s.active)return {playing:s.playing,loop:s.snapshot.settings.loop,disabled:s.snapshot.frames.length<2,count:s.snapshot.frames.length,index:s.snapshot.index};if(['radar','satellite'].includes(w.product))return {playing:w.snapshot.playing,loop:w.options.loop,disabled:w.snapshot.times.length<2,count:w.snapshot.times.length,index:Math.max(0,w.snapshot.times.indexOf(w.snapshot.selectedTime??0))};return {playing:b.state.transport==='playing',loop:b.state.loop,disabled:!b.canPlay&&b.state.transport!=='playing',count:0,index:0};}
export function PlaybackButtons({state,command}:{state:PlaybackState;command:(command:string)=>void}){return <div className="onair-playback"><IconButton icon="previous" label="Previous frame or scene" onClick={()=>command('previous')}/><IconButton icon={state.playing?'pause':'play'} label="Play / pause" disabled={state.disabled} onClick={()=>command('play-pause')}/><IconButton icon="next" label="Next frame or scene" onClick={()=>command('next')}/><IconButton icon="loop" label="Loop" aria-pressed={state.loop} onClick={()=>command('loop')}/><IconButton icon="refresh" label="Refresh weather" onClick={()=>command('refresh')}/>{state.count>0&&<><IconButton icon="latest" label="Latest frame" onClick={()=>command('latest')}/><input aria-label="Weather frame" type="range" min="0" max={Math.max(0,state.count-1)} value={state.index} onChange={e=>command(`seek:${e.target.value}`)}/></>}</div>;}
export function HiddenPlayback(){const state=usePlaybackState(),command=useOnAirCommands();return <PlaybackButtons state={state} command={command}/>;}
export function OnAirMenu({onDrawStart}:{onDrawStart?:()=>void}){const presets=useLayerPresets(),qpf=useQpf(),forecast=useForecastGraphics(),radar=useRadarOverlay(),dispatch=useOnAirCommands(),command=(value:string)=>{dispatch(value);if(value==='pen'||value==='track')onDrawStart?.();},ewx=useEwxAlerts(),tools=useOnAirTools(),weather=useCurrentWeather(),synoptic=useSynoptic();const bounds=synoptic.map?.getBounds();const flashes=tools.snapshot.overlays[1]?.payload?.data?.features.filter(f=>f.geometry.type==='Point'&&(!bounds||bounds.contains(f.geometry.coordinates.slice(0,2)as[number,number]))).length;
 return <><ForecastLocationControls/><BroadcastToolButtons presets={presets} command={command} ewx={ewx.state.enabled} enabled={tools.enabled} radar={radar.enabled} sweeps={radar.options.sweepsEnabled}/><details className="onair-status"><summary title="Weather status and radar site" aria-label="Weather status and radar site"><ToolIcon name="info"/><span>Status / site</span></summary><div className="onair-status-body"><span>{synoptic.active?`${PRODUCTS.find(p=>p.id===synoptic.snapshot.productId)?.title} · ${synoptic.snapshot.status}`:qpf.active?qpf.snapshot.message:forecast.active?forecast.message:weather.snapshot.message}</span>{radar.enabled&&<><span>{radar.snapshot.message}</span><label>Radar site<select value={radar.snapshot.primaryRadarId??''} onChange={e=>void radar.controller.setPrimaryRadar(e.target.value)}><option value="">Select radar</option>{radar.snapshot.radarSites.map(site=><option key={site.id} value={site.id}>{site.city} — {site.id}</option>)}</select></label></>}{OVERLAYS.map((p,i)=>tools.enabled[p.id]&&<span key={p.id}>{p.label}: {tools.snapshot.overlays[i]?.status}{p.id==='lightning'&&flashes!==undefined?` · ${flashes} flashes in view`:''}</span>)}{tools.mode!=='none'&&<strong>{tools.mode==='pen'?'PEN ACTIVE · drag on map':'TRACK ACTIVE · click origin, then direction'} <button onClick={()=>tools.setMode('none')}>Done</button></strong>}</div></details></>;
}
