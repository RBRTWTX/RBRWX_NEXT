import {DecodeWorker} from './DecodeWorker';
import {checkModelTime,HRRR_MAX_RUN_AGE} from './futurecast';
import { publishedTimes, imageRequest, services } from '../current-weather/public-imagery';
import type { Map as WeatherMap, GeoJSONSource } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { gridBytes, gridFrames, keys, BUCKETS, response, vectorPayload, surfacePayload } from './providers';
import { legendFor } from './palette';
import { emptyPack, type PackSnapshot, type Product, type SceneSettings, type Payload, type Frame } from './model';
const SOURCE='rbrwx-synoptic',LAYERS=['rbrwx-synoptic-fill','rbrwx-synoptic-line','rbrwx-synoptic-point','rbrwx-synoptic-label'];
const EMPTY:FeatureCollection={type:'FeatureCollection',features:[]};
export class SynopticRuntime {
 map:WeatherMap|null=null;snapshot=emptyPack();private product:Product|null=null;private abort:AbortController|null=null;private generation=0;private timer:ReturnType<typeof setInterval>|null=null;private moveTimer:ReturnType<typeof setTimeout>|null=null;private imageIds:string[]=[];private glmCache:Payload|null=null;private imageSerial=0;private gridCache=new Map<string,Payload>();
 private gridWorker=new DecodeWorker(()=>new Worker(new URL('./grids.worker.ts',import.meta.url),{type:'module'}));
 private glmWorker=new DecodeWorker(()=>new Worker(new URL('./glm.worker.ts',import.meta.url),{type:'module'}));
 private source:string;private layers:string[];
 constructor(private notify:(s:PackSnapshot)=>void,namespace='rbrwx-synoptic'){this.source=namespace;this.layers=['fill','line','point','label'].map(kind=>`${namespace}-${kind}`);}
 private emit(patch:Partial<PackSnapshot>){this.snapshot={...this.snapshot,...patch};this.notify(this.snapshot);}
 connect(map:WeatherMap){this.map=map;map.on('moveend',this.move);this.timer=setInterval(()=>{const p=this.snapshot.payload;if(p?.expires&&Date.now()>=p.expires){this.abort?.abort();++this.generation;this.clear();this.emit({payload:null,backgroundPayload:null,status:'UNAVAILABLE · displayed product expired'});}const bg=this.snapshot.backgroundPayload;if(bg?.expires&&Date.now()>=bg.expires){this.removeChannel('background');this.emit({backgroundPayload:null});}},1000);if(this.product)void this.refresh();return()=>this.disconnect();}
 disconnect(){this.abort?.abort();this.gridWorker.destroy();this.glmWorker.destroy();this.gridCache.clear();this.glmCache=null;++this.generation;if(this.timer)clearInterval(this.timer);if(this.moveTimer)clearTimeout(this.moveTimer);this.map?.off('moveend',this.move);this.clear();this.map=null;}
 private move=()=>{if(this.moveTimer)clearTimeout(this.moveTimer);this.moveTimer=setTimeout(()=>{if(this.product&&(this.product.kind==='grid'||this.snapshot.settings.background!=='none'))void this.loadFrame(this.snapshot.index);},450);};
 select(product:Product|null,settings:SceneSettings){const changed=product?.id!==this.product?.id;this.product=product;if(changed){this.gridCache.clear();this.glmCache=null;this.abort?.abort();++this.generation;this.clear();this.emit({...emptyPack(),productId:product?.id??null,settings,status:product?'Waiting for map…':'OFF'});if(product&&this.map)void this.refresh();}else{this.emit({settings});this.apply();}}
 private removeChannel(channel:string){const m=this.map;if(!m)return;for(const id of this.imageIds.filter(x=>x.includes(`-${channel}-`))){if(m.getLayer(id))m.removeLayer(id);if(m.getSource(id))m.removeSource(id);}this.imageIds=this.imageIds.filter(x=>!x.includes(`-${channel}-`));}
 private clear(){const m=this.map;if(!m)return;for(const id of [...this.layers,...this.imageIds])if(m.getLayer(id))m.removeLayer(id);for(const id of [this.source,...this.imageIds])if(m.getSource(id))m.removeSource(id);this.imageIds=[];}
 private apply(){const m=this.map;if(!m)return;const s=this.snapshot.settings;for(const id of this.imageIds)if(m.getLayer(id))m.setPaintProperty(id,'raster-opacity',s.opacity);if(m.getLayer(this.layers[0]))m.setPaintProperty(this.layers[0],'fill-opacity',s.opacity*.5);for(const id of this.layers){if(m.getLayer(id))m.setFilter(id,['all',...(id===this.layers[0]?[['==',['geometry-type'],'Polygon']]:id===this.layers[2]||id===this.layers[3]?[['==',['geometry-type'],'Point']]:[]),...(!s.contours?[['!=',['get','_contour'],true]]:[]),...(s.storm?[['==',['get','_storm'],s.storm]]:[])] as any);}if(m.getLayer(this.layers[3]))m.setLayoutProperty(this.layers[3],'visibility',s.labels?'visible':'none');}
 private vectors(data:FeatureCollection,preserveImage=false){const m=this.map;if(!m)return;if(preserveImage){for(const id of this.layers)if(m.getLayer(id))m.removeLayer(id);if(m.getSource(this.source))m.removeSource(this.source);}else this.clear();const anchor=m.getLayer('rbrwx-county-boundary')?'rbrwx-county-boundary':undefined;m.addSource(this.source,{type:'geojson',data});
  m.addLayer({id:this.layers[0],type:'fill',source:this.source,filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':['coalesce',['get','_color'],'#e16675'],'fill-opacity':.35}},anchor);
  m.addLayer({id:this.layers[1],type:'line',source:this.source,paint:{'line-color':['coalesce',['get','_stroke'],['get','_color'],'#ffffff'],'line-width':['case',['boolean',['get','_analysis'],false],1,2]}},anchor);
  m.addLayer({id:this.layers[2],type:'circle',source:this.source,filter:['==',['geometry-type'],'Point'],paint:{'circle-color':['coalesce',['get','_color'],'#ffe64e'],'circle-radius':['case',['boolean',['get','_analysis'],false],0,5],'circle-stroke-width':1,'circle-stroke-color':'#17243a','circle-opacity':['coalesce',['get','_alpha'],1]}},anchor);
  m.addLayer({id:this.layers[3],type:'symbol',source:this.source,filter:['==',['geometry-type'],'Point'],layout:{'text-field':['coalesce',['get','_label'],''],'text-size':15,'text-offset':[0,1.2]},paint:{'text-color':'white','text-halo-color':'#122238','text-halo-width':2}});this.apply();
 }
 private async image(payload:Payload,signal:AbortSignal,channel='weather'){const m=this.map;if(!m||!payload.image||!payload.coordinates)return;const id=`${this.source}-image-${channel}-${++this.imageSerial}`;this.imageIds.push(id);
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>finish(Error('Weather image failed to render')),15000);const cancel=()=>finish(new DOMException('Cancelled','AbortError'));const loaded=(e:{sourceId?:string;isSourceLoaded?:boolean})=>{if(e.sourceId===id&&e.isSourceLoaded)finish();};let settled=false;const finish=(e?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);m.off('sourcedata',loaded);signal.removeEventListener('abort',cancel);if(e){if(m.getLayer(id))m.removeLayer(id);if(m.getSource(id))m.removeSource(id);this.imageIds=this.imageIds.filter(x=>x!==id);reject(e);}else resolve();};m.on('sourcedata',loaded);signal.addEventListener('abort',cancel,{once:true});try{if(signal.aborted){cancel();return;}m.addSource(id,{type:'image',url:payload.image!,coordinates:payload.coordinates as [[number,number],[number,number],[number,number],[number,number]]});m.addLayer({id,type:'raster',source:id,paint:{'raster-opacity':0,'raster-fade-duration':0,'raster-resampling':this.snapshot.productId==='mrms-type'?'nearest':'linear'}},m.getLayer('rbrwx-county-boundary')?'rbrwx-county-boundary':undefined);}catch(e){finish(e as Error);}});
  if(signal.aborted)return;for(const old of this.imageIds.filter(x=>x!==id&&x.includes(`-${channel}-`))){if(m.getLayer(old))m.removeLayer(old);if(m.getSource(old))m.removeSource(old);}this.imageIds=this.imageIds.filter(x=>!x.includes(`-${channel}-`)||x===id);m.setPaintProperty(id,'raster-opacity',this.snapshot.settings.opacity);
 }
 async refresh(){this.glmCache=null;const p=this.product;if(!p||!this.map)return;if(p.kind==='grid'){const abort=new AbortController();this.abort?.abort();this.abort=abort;try{this.emit({status:'Discovering NOAA frames…'});const frames=await gridFrames(p,abort.signal);if(abort.signal.aborted)return;if(!frames.length)throw Error('No fresh published frames');const initial=p.family==='futurecast'?Math.max(0,frames.findIndex(f=>f.time>=Date.now())):frames.length-1;this.emit({frames,index:initial});await this.loadFrame(initial);}catch(e){if(!abort.signal.aborted){this.clear();this.emit({payload:null,backgroundPayload:null,status:`UNAVAILABLE · ${String(e)}`});}}}else await this.loadFrame(0);}
 async loadFrame(index:number){const p=this.product,map=this.map;if(!p||!map)return;this.abort?.abort();const abort=new AbortController();this.abort=abort;const gen=++this.generation;this.emit({status:'Loading official weather…'});
  try{let payload:Payload;
   if(p.kind==='manual')payload={time:null,expires:null,note:'OPERATOR FORECAST · manually positioned objects'};
   else if(p.kind==='surface')payload=await surfacePayload(abort.signal);
   else if(p.kind==='glm'){
    if(!this.glmCache){this.glmCache=await this.lightning(abort.signal);const end=this.glmCache.time!;const frames=Array.from({length:this.snapshot.settings.windowMinutes},(_,i)=>({time:end-(this.snapshot.settings.windowMinutes-1-i)*60000,key:String(i)}));index=frames.length-1;this.emit({frames});}
    const end=this.snapshot.frames[index]?.time??this.glmCache.time!;
    const features=this.glmCache.data!.features.filter(f=>Date.parse(String(f.properties?.time))<=end).map(f=>({...f,properties:{...f.properties,_alpha:Math.max(.12,1-(end-Date.parse(String(f.properties?.time)))/(this.snapshot.settings.windowMinutes*60000))}}));
    if(p.id==='glm-density'){
     const cells=new Map<string,{lng:number;lat:number;count:number}>();for(const f of features){if(f.geometry.type!=='Point')continue;const [lng,lat]=f.geometry.coordinates,x=Math.floor(lng*10)/10,y=Math.floor(lat*10)/10,key=`${x},${y}`;const cell=cells.get(key)??{lng:x+.05,lat:y+.05,count:0};cell.count++;cells.set(key,cell);}
     payload={...this.glmCache,time:end,data:{type:'FeatureCollection',features:[...cells.values()].map(c=>({type:'Feature',geometry:{type:'Point',coordinates:[c.lng,c.lat]},properties:{_label:String(c.count),_color:c.count>20?'#fa3535':c.count>5?'#ffaa32':'#fff27a',_alpha:1}}))},note:'GLM flash-centroid counts per 0.1° cell · not flash extent density'};
    }else payload={...this.glmCache,time:end,data:{type:'FeatureCollection',features}};
   }
   else if(p.kind==='grid'){
    const frame=this.snapshot.frames[index];if(!frame)throw Error('Frame not in published timeline');if(Date.now()-(frame.runTime??frame.time)>p.ageMinutes*60000)throw Error('Selected frame expired');
    const b=map.getBounds(),west=Math.max(-180,b.getWest()),east=Math.min(180,b.getEast()),south=Math.max(-80,b.getSouth()),north=Math.min(80,b.getNorth());if(west>=east)throw Error('Move map into data coverage');
    const cacheKey=[p.id,frame.key,frame.time,west,south,east,north,map.getCanvas().width,map.getCanvas().height].join(':');const cached=this.gridCache.get(cacheKey);if(cached){payload=cached;}else{
    const width=640,height=Math.min(720,Math.max(200,Math.round(640*map.getCanvas().height/Math.max(1,map.getCanvas().width)))),bytes=await gridBytes(p,frame,abort.signal);
    const result=await this.gridWorker.run<{rgba:Uint8ClampedArray;width:number;height:number;time:number;validTime:number;data?:FeatureCollection}>({bytes,product:p,bounds:[west,south,east,north],width,height},abort.signal,[bytes]);
    checkModelTime(p,frame,result.time,result.validTime);
    if(p.family!=='futurecast'&&Math.abs(result.time-frame.time)>60000)throw Error('GRIB reference time does not match advertised frame');
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(result.rgba),width,height),0,0);
    payload={data:result.data,time:p.family==='futurecast'?result.validTime:result.time,timeLabel:p.family==='futurecast'?`HRRR RUN ${new Date(result.time).toISOString().slice(5,16).replace('T',' ')}Z · F${String(frame.forecastHour).padStart(2,'0')} · VALID`:undefined,expires:result.time+p.ageMinutes*60000,image:canvas.toDataURL(),coordinates:[[west,north],[east,north],[east,south],[west,south]],legend:legendFor(p),note:p.family==='futurecast'?`HRRR MODEL FORECAST · run ${new Date(result.time).toISOString()} · valid ${new Date(result.validTime).toISOString()}`:p.id.startsWith('urma')?'URMA delayed analysis · not live observations':p.title};
    this.gridCache.set(cacheKey,payload);if(this.gridCache.size>12)this.gridCache.delete(this.gridCache.keys().next().value!);}
   }else payload=await vectorPayload(p,abort.signal);
   if(abort.signal.aborted||gen!==this.generation)return;if(payload.expires!==null&&payload.expires<=Date.now())throw Error('Product expired during load');
   if(payload.image){await this.image(payload,abort.signal);if(payload.data&&!abort.signal.aborted)this.vectors(payload.data,true);}else if(payload.data)this.vectors(payload.data);else this.clear();
   if(abort.signal.aborted||gen!==this.generation)return;
   let backgroundPayload:Payload|null=null;this.removeChannel('background');
   if(this.snapshot.settings.background!=='none'){
    try{backgroundPayload=await this.background(this.snapshot.settings.background,abort.signal);if(abort.signal.aborted||gen!==this.generation)return;await this.image(backgroundPayload,abort.signal,'background');const bg=this.imageIds.find(id=>id.includes('-background-'));const main=this.imageIds.find(id=>id.includes('-weather-'))??this.layers.find(id=>map.getLayer(id));if(bg&&main)map.moveLayer(bg,main);}catch(e){if(abort.signal.aborted)return;payload={...payload,note:`${payload.note??''} · Background unavailable`};}
   }
   if(abort.signal.aborted||gen!==this.generation)return;this.emit({payload,backgroundPayload,index,status:payload.note??'READY'});
  }catch(e){if(!abort.signal.aborted&&gen===this.generation){this.clear();this.emit({payload:null,backgroundPayload:null,status:`UNAVAILABLE · ${e instanceof Error?e.message:String(e)}`});}}
 }
 private async lightning(signal:AbortSignal):Promise<Payload>{
  const end=Date.now(),start=end-this.snapshot.settings.windowMinutes*60000;
  const hours=[end,start].map(t=>{const d=new Date(t),j=Math.floor((t-Date.UTC(d.getUTCFullYear(),0,1))/86400000)+1;return `GLM-L2-LCFA/${d.getUTCFullYear()}/${String(j).padStart(3,'0')}/${String(d.getUTCHours()).padStart(2,'0')}/`;});
  const all=(await Promise.all([...new Set(hours)].map(p=>keys(BUCKETS.glm,p,signal)))).flat();
  const files=all.filter(k=>{const m=/_e(\d{4})(\d{3})(\d{2})(\d{2})(\d{2})/.exec(k);if(!m)return false;const t=Date.UTC(+m[1],0,+m[2],+m[3],+m[4],+m[5]);return t>=start&&t<=end;}).sort();
  if(!files.length)throw Error('No recent GLM files');if(files.length>100)throw Error('GLM window exceeds bounded download limit');
  const bytes:ArrayBuffer[]=[];for(let i=0;i<files.length;i+=4)bytes.push(...await Promise.all(files.slice(i,i+4).map(async k=>(await response(BUCKETS.glm+k,signal)).arrayBuffer())));
  const result=await this.glmWorker.run<{points:{lng:number;lat:number;time:number}[];coverage:number}>({files:bytes,start,end},signal,bytes);
  if(end-result.coverage>600000)throw Error('GLM coverage is stale');
  return {time:result.coverage,expires:result.coverage+600000,data:{type:'FeatureCollection',features:result.points.map((p,i)=>({type:'Feature',id:i,geometry:{type:'Point',coordinates:[p.lng,p.lat]},properties:{_color:'#ffef63',_label:'',_alpha:Math.max(.12,1-(end-p.time)/(end-start)),time:new Date(p.time).toISOString()}}))},note:`GOES-19 GLM total-lightning flash centroids · ${this.snapshot.settings.windowMinutes} minutes · coverage through ${new Date(result.coverage).toISOString()}`};
 }
 private async background(product:'radar'|'satellite',signal:AbortSignal):Promise<Payload>{
  const source=services[product],xml=await(await response(`${source.url}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities`,signal)).text(),time=publishedTimes(xml,source.layer).at(-1)!;
  const age=(product==='radar'?20:30)*60000;if(!Number.isFinite(time)||time>Date.now()+60000||Date.now()-time>age)throw Error('Background imagery is stale');
  const b=this.map!.getBounds(),w=Math.max(-180,b.getWest()),e=Math.min(180,b.getEast()),s=Math.max(-80,b.getSouth()),n=Math.min(80,b.getNorth());
  const mx=(l:number)=>l*20037508.342789244/180,my=(l:number)=>Math.log(Math.tan(Math.PI/4+l*Math.PI/360))*6378137;
  const r=await response(imageRequest(product,time,[mx(w),my(s),mx(e),my(n)],1000,700),signal);if(!r.headers.get('content-type')?.includes('image/png'))throw Error('Background service returned non-image');
  const blob=await r.blob();const bitmap=await createImageBitmap(blob);bitmap.close();
  const image=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('Image decode failed'));reader.readAsDataURL(blob);});
  return {time,expires:time+age,image,coordinates:[[w,n],[e,n],[e,s],[w,s]]};
 }
 renderSnapshot(snapshot:PackSnapshot){this.abort?.abort();const gen=++this.generation;this.removeChannel('background');this.snapshot=snapshot;if(snapshot.payload?.expires&&snapshot.payload.expires<Date.now()){this.clear();return;}if(snapshot.payload?.image){const abort=new AbortController();this.abort=abort;void this.image(snapshot.payload,abort.signal).then(()=>{if(gen===this.generation&&snapshot.payload?.data)this.vectors(snapshot.payload.data,true);}).catch(()=>{if(gen===this.generation)this.clear();});}else if(snapshot.payload?.data)this.vectors(snapshot.payload.data);else this.clear();if(snapshot.backgroundPayload&&(!snapshot.backgroundPayload.expires||snapshot.backgroundPayload.expires>Date.now())){const abort=this.abort??new AbortController();this.abort=abort;void this.image(snapshot.backgroundPayload,abort.signal,'background').then(()=>{const bg=this.imageIds.find(x=>x.includes('-background-')),main=this.imageIds.find(x=>x.includes('-weather-'))??this.layers.find(x=>this.map?.getLayer(x));if(bg&&main)this.map?.moveLayer(bg,main);}).catch(()=>undefined);}}
}
