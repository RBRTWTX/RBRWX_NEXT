import{useCurrentWeather}from'../current-weather/CurrentWeather';
import{useEwxAlerts}from'../current-weather/EwxAlerts';
import{useGraphics}from'../broadcast-graphics/Graphics';
import{useSynoptic}from'../synoptic/Scene';
import{OVERLAYS,useOnAirTools}from'../synoptic/OnAirTools';
import{PRODUCTS}from'../synoptic/model';
import type{Options}from'../current-weather/model';
import'./onAirMenu.css';
export function useOnAirCommands(){const weather=useCurrentWeather(),synoptic=useSynoptic(),tools=useOnAirTools(),graphics=useGraphics(),ewx=useEwxAlerts();return(command:string):boolean=>{
 if(command==='bar-add'){if(synoptic.active)synoptic.edit({titleVisible:true});else if(!graphics.visible.title)graphics.toggle('title');return true;}
 if(command==='bar-refresh'){if(synoptic.active){const{title,time,...rest}=synoptic.snapshot.settings.textOverrides??{};synoptic.edit({titleVisible:true,title:'',textOverrides:rest});}else{graphics.edit({manual:false});if(!graphics.visible.title)graphics.toggle('title');}return true;}
 if(command==='ewx-toggle'){ewx.edit({enabled:!ewx.state.enabled});return true;}
 if(command==='ewx-refresh'){ewx.refresh();return true;}
 if(command==='sweeps'){weather.edit({sweepsEnabled:!weather.options.sweepsEnabled});return true;}
 if(command==='pen'){tools.setMode(tools.mode==='pen'?'none':'pen');return true;}
 if(command==='track'){tools.setMode(tools.mode==='track'?'none':'track');return true;}
 if(command==='pen-undo'){tools.edit({strokes:tools.snapshot.objects.strokes.slice(0,-1)});return true;}
 if(command==='pen-clear'){tools.edit({strokes:[]});return true;}
 if(command==='track-clear'){tools.edit({track:[]});return true;}
 if(command.startsWith('speed:')){const mph=Number(command.slice(6));if(Number.isFinite(mph)&&mph>=1&&mph<=150)tools.edit({mph});return true;}
 if(command.startsWith('color:')){const color=command.slice(6);if(/^#[a-f0-9]{6}$/i.test(color))tools.setColor(color);return true;}
 if(command.startsWith('overlay:')){const id=command.slice(8);if(OVERLAYS.some(p=>p.id===id))tools.toggle(id);return true;}
 if(command.startsWith('radar:')){const field=command.slice(6);if(['reflectivity','velocity','hydro'].includes(field)){synoptic.setProduct(null);weather.setProduct('radar');weather.edit({radarField:field as Options['radarField'],mrmsEnabled:false});}return true;}
 if(command.startsWith('satellite:')){const feed=command.slice(10);if(['longwave','shortwave','visible','water_vapor','snow_ice'].includes(feed)){synoptic.setProduct(null);weather.setProduct('satellite');weather.edit({satelliteFeed:feed as Options['satelliteFeed']});}return true;}
 if(command.startsWith('mrms:')){const id=command.slice(5);if(PRODUCTS.some(p=>p.id===id&&p.family==='mrms')){weather.setProduct('map');synoptic.setProduct(id);}return true;}
 if(command==='layers-off'){weather.setProduct('map');synoptic.setProduct(null);return true;}
 if(command==='overlays-refresh'){tools.refresh();return true;}
 return false;
};}
export function BroadcastToolButtons({command,ewx=false,enabled={},draw=true}:{command:(value:string)=>void;ewx?:boolean;enabled?:Record<string,boolean>;draw?:boolean}){
 return <div className="onair-toolbar" aria-label="Broadcast tools">
 <button onClick={()=>command('bar-add')}>ADD TITLE</button><button onClick={()=>command('bar-refresh')}>REFRESH TITLE</button>
 <button onClick={()=>command('ewx-toggle')} aria-pressed={ewx}>EWX ALERT SCROLL {ewx?'ON':'OFF'}</button>
 {OVERLAYS.map(item=><button key={item.id} onClick={()=>command(`overlay:${item.id}`)} aria-pressed={enabled[item.id]??false}>{item.label.toUpperCase()}</button>)}
 <button onClick={()=>command('sweeps')}>SWEEPS</button><button onClick={()=>command('overlays-refresh')}>REFRESH OVERLAYS</button>
 <details><summary>◉ RADAR</summary><div className="onair-submenu">
 <button onClick={()=>command('radar:reflectivity')}>Site reflectivity</button><button onClick={()=>command('radar:velocity')}>Radial velocity</button><button onClick={()=>command('radar:hydro')}>Hydrometeor classification</button>
 <label>MRMS product<select defaultValue="" onChange={e=>{if(e.target.value)command(`mrms:${e.target.value}`);e.target.value='';}}><option value="">Choose MRMS layer…</option>{PRODUCTS.filter(p=>p.family==='mrms').map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
 <small>Products use each site's advertised layers. Missing products show unavailable.</small></div></details>
 <details><summary>SATELLITE</summary><div className="onair-submenu">{[['longwave','Longwave infrared'],['visible','Visible'],['water_vapor','Water vapor'],['shortwave','Shortwave infrared'],['snow_ice','Snow / ice']].map(([id,label])=><button key={id} onClick={()=>command(`satellite:${id}`)}>{label}</button>)}</div></details>
 <details><summary>✎ DRAW</summary><div className="onair-submenu"><button disabled={!draw} onClick={()=>command('pen')}>Pen on / off</button><button onClick={()=>command('pen-undo')}>Undo stroke</button><button onClick={()=>command('pen-clear')}>Clear ink</button><label>Pen color<input type="color" defaultValue="#fff000" onChange={e=>command(`color:${e.target.value}`)}/></label>{!draw&&<small>Draw directly on the operator canvas.</small>}</div></details>
 <details><summary>↗ TRACK</summary><div className="onair-submenu"><button disabled={!draw} onClick={()=>command('track')}>Place direction: click origin, then ahead</button><label>Storm speed (mph)<input type="number" min="1" max="150" defaultValue="30" onChange={e=>command(`speed:${e.target.value}`)}/></label><button onClick={()=>command('track-clear')}>Clear track</button><small>Operator estimate, not an automatic storm-motion forecast. Arrival times use visible cities near the projected path.</small></div></details>
 <button onClick={()=>command('layers-off')}>WEATHER LAYER OFF</button><button onClick={()=>command('ewx-refresh')}>REFRESH EWX</button>
 </div>;
}
export function OnAirMenu({onDrawStart}:{onDrawStart?:()=>void}){const dispatch=useOnAirCommands(),command=(value:string)=>{dispatch(value);if(value==='pen'||value==='track')onDrawStart?.();},ewx=useEwxAlerts(),tools=useOnAirTools(),weather=useCurrentWeather(),synoptic=useSynoptic();const bounds=synoptic.map?.getBounds();const flashes=tools.snapshot.overlays[1]?.payload?.data?.features.filter(f=>f.geometry.type==='Point'&&(!bounds||bounds.contains(f.geometry.coordinates.slice(0,2)as[number,number]))).length;
 return <><BroadcastToolButtons command={command} ewx={ewx.state.enabled} enabled={tools.enabled}/><div className="onair-status"><span>{synoptic.active?`${PRODUCTS.find(p=>p.id===synoptic.snapshot.productId)?.title} · ${synoptic.snapshot.status}`:weather.snapshot.message}</span>{weather.product==='radar'&&<label>Radar site<select value={weather.snapshot.primaryRadarId??''} onChange={e=>void weather.controller.setPrimaryRadar(e.target.value)}><option value="">Select radar</option>{weather.snapshot.radarSites.map(site=><option key={site.id} value={site.id}>{site.city} — {site.id}</option>)}</select></label>}{OVERLAYS.map((p,i)=>tools.enabled[p.id]&&<span key={p.id}>{p.label}: {tools.snapshot.overlays[i]?.status}{p.id==='lightning'&&flashes!==undefined?` · ${flashes} flashes in view`:''}</span>)}{tools.mode!=='none'&&<strong>{tools.mode==='pen'?'PEN ACTIVE · drag on map':'TRACK ACTIVE · click origin, then direction'} <button onClick={()=>tools.setMode('none')}>Done</button></strong>}</div></>;
}
