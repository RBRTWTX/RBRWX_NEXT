import type { Map as WeatherMap, GeoJSONSource } from 'maplibre-gl';
import { PublicImagery } from './public-imagery';
import { defaultOptions, frameTimes, freshness, initialSnapshot, nextFrame, temperature, type Options, type Product, type Snapshot } from './model';
import { ObservationsClient } from './observations';
const sourceId = 'rbrwx-current-observations';
const layerId = 'rbrwx-current-observation-labels';
export type ManagerFactory = (map: WeatherMap, options: ConstructorParameters<typeof PublicImagery>[1]) => Promise<PublicImagery>;
const loadManager: ManagerFactory = async (map, options) => new PublicImagery(map, options);
export class CurrentWeatherController {
  private map: WeatherMap | null = null;
  private manager: PublicImagery | null = null;
  private generation = 0;
  private abort: AbortController | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private moveTimer: ReturnType<typeof setTimeout> | null = null;
  private playTimer: ReturnType<typeof setInterval> | null = null;
  private scene = '';
  private product: Product = 'map';
  private options = defaultOptions();
  private apiKey = '';
  private anchor = '';
  private requested: number | null = null;
  private loadStarted = 0;
  private received = 0;
  private networkFailed = false;
  private refreshing = false;
  private observations = new ObservationsClient();
  snapshot = initialSnapshot();
  constructor(private notify: (snapshot: Snapshot) => void, private factory = loadManager) {}
  private emit(patch: Partial<Snapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.notify(this.snapshot); }
  connect(map: WeatherMap, anchor: string): () => void { this.map = map; this.anchor = anchor; void this.start(); return () => { this.clear(); this.map = null; }; }
  select(scene: string, product: Product, options: Options, apiKey: string) {
    const reload = scene !== this.scene || product !== this.product || apiKey !== this.apiKey;
    this.scene = scene; this.product = product; this.options = options; this.apiKey = apiKey;
    if(reload) void this.start(); else {
      void this.manager?.setOpacity(options.opacity).catch(()=>this.emit({status:'unavailable',message:'Unable to update imagery opacity'}));
      void this.manager?.setUnits(options.units).catch(()=>this.emit({status:'unavailable',message:'Unable to update weather units'}));
      this.drawObservations();
    }
  }
  private clear() {
    this.generation++; this.abort?.abort(); this.abort=null; this.stop();
    if(this.interval)clearInterval(this.interval);if(this.refreshInterval)clearInterval(this.refreshInterval);if(this.moveTimer)clearTimeout(this.moveTimer);
    this.interval=null;this.refreshInterval=null;this.moveTimer=null;
    this.map?.off('moveend',this.move);
    this.manager?.destroy();this.manager=null;
    if(this.map?.getLayer(layerId))this.map.removeLayer(layerId);
    if(this.map?.getSource(sourceId))this.map.removeSource(sourceId);
    this.requested=null;this.received=0;this.networkFailed=false;this.refreshing=false;
  }
  destroy() { this.clear(); this.map=null; }
  private async start() {
    this.clear(); const generation=this.generation,map=this.map;
    this.emit(initialSnapshot());if(this.product==='map')return;
    if(!map){this.emit({status:'loading',message:'Waiting for geographic map'});return;}
    if(this.product==='observations') {
      map.addSource(sourceId,{type:'geojson',data:{type:'FeatureCollection',features:[]},attribution:'NOAA / National Weather Service observations'});
      map.addLayer({id:layerId,type:'symbol',source:sourceId,layout:{'text-field':['get','label'],'text-size':15,'text-font':['Noto Sans Bold'],'text-offset':[0,1],'text-anchor':'top','text-allow-overlap':false},paint:{'text-color':'#ffffff','text-halo-color':'#07111a','text-halo-width':2,'text-opacity':this.options.opacity}},this.anchor);
      map.on('moveend',this.move);await this.loadObservations(generation);
      if(generation!==this.generation)return;
      this.refreshInterval=setInterval(()=>void this.loadObservations(generation),300000);
      this.interval=setInterval(()=>this.drawObservations(),15000);return;
    }
    this.emit({status:'loading',message:'Loading public NOAA imagery…'});this.loadStarted=Date.now();
    try {
      const manager=await this.factory(map,{
        product:this.product, anchor:this.anchor, opacity:this.options.opacity,
        onError:message=>{if(generation===this.generation){this.networkFailed=true;this.emit({status:'unavailable',message});}}, 
      });
      if(generation!==this.generation){manager.destroy();return;}this.manager=manager;
      manager.on('state:change',state=>{
        if(generation!==this.generation)return;
        const times=frameTimes(state.availableTimestamps);
        const raw=state.mrmsTimestamp;
        this.requested=frameTimes([raw])[0]??null;
        this.emit({times,selectedTime:this.requested});
      });
      this.interval=setInterval(()=>this.pollFrame(),500);
      await manager.initialize();if(generation!==this.generation)return;
      this.received=Date.now();this.refreshInterval=setInterval(()=>void this.refresh(),120000);
    }catch(error){if(generation===this.generation){this.networkFailed=true;this.emit({status:'unavailable',message:`Public NOAA imagery: ${error instanceof Error?error.message:'request failed'}. Refresh to retry.`});}}
  }
  private pollFrame() {
    const manager=this.manager;if(!manager)return;
    const time=frameTimes([manager.currentLoadedTimeKey])[0]??null;
    if(time!==null){const status=freshness(time,this.product==='radar'?15:30,this.networkFailed||Date.now()-this.received>180000);this.emit({time,status,message:`${this.product==='radar'?'NOAA MRMS base reflectivity':'NOAA GOES East/West infrared · Band 14'} · ${status.toUpperCase()} · ${new Date(time).toLocaleString()}`});}
    else if(Date.now()-this.loadStarted>60000)this.emit({time:null,status:'unavailable',message:'No NOAA imagery loaded. Check the connection, then Refresh.'});
  }
  private move=()=>{if(this.moveTimer)clearTimeout(this.moveTimer);this.moveTimer=setTimeout(()=>void this.loadObservations(this.generation),650);};
  private async loadObservations(generation:number){
    const map=this.map;if(!map)return;this.abort?.abort();const abort=new AbortController();this.abort=abort;
    const center=map.getCenter();this.emit({status:'loading',message:'Loading stations near the map center…',observations:[],time:null});this.drawObservations();
    try{const observations=await this.observations.load(center.lng,center.lat,abort.signal);if(generation!==this.generation||abort.signal.aborted)return;this.emit({observations});this.drawObservations();}
    catch(error){if(generation===this.generation&&!abort.signal.aborted)this.emit({status:'unavailable',message:`NWS observations: ${error instanceof Error?error.message:'request failed'}. Refresh to retry.`});}
  }
  private drawObservations(){
    if(this.product!=='observations')return;const observations=this.snapshot.observations;
    const features=observations.map(o=>{const state=freshness(o.time,90,o.cached);return{type:'Feature' as const,geometry:{type:'Point' as const,coordinates:[o.lng,o.lat]},properties:{label:`${o.id}  ${temperature(o.temperature,this.options.units)}${state==='stale'?' · STALE':state==='unavailable'?' · TIME INVALID':''}`}};});
    (this.map?.getSource(sourceId) as GeoJSONSource|undefined)?.setData({type:'FeatureCollection',features});
    if(this.map?.getLayer(layerId))this.map.setPaintProperty(layerId,'text-opacity',this.options.opacity);
    if(observations.length){const states=observations.map(o=>freshness(o.time,90,o.cached));const status=states.includes('unavailable')?'unavailable':states.includes('stale')?'stale':states.includes('cached')?'cached':'fresh';this.emit({status,time:Math.min(...observations.map(o=>o.time)),message:`NWS · ${observations.length} nearby stations · ${status.toUpperCase()} · Individual observation times below`});}
  }
  async refresh(){if(this.refreshing)return;this.refreshing=true;const generation=this.generation;
    try{if(this.product==='observations')await this.loadObservations(generation);else if(this.manager){await this.manager.refreshData();if(generation===this.generation){this.received=Date.now();this.networkFailed=false;this.pollFrame();}}else await this.start();}
    catch{if(generation===this.generation){this.networkFailed=true;this.emit({status:this.snapshot.time?freshness(this.snapshot.time,this.product==='radar'?15:30,true):'unavailable',message:'Refresh failed. Any displayed frame retains its original timestamp.'});}}
    finally{if(generation===this.generation)this.refreshing=false;}
  }
  async seek(time:number){if(!this.manager||!this.snapshot.times.includes(time))return;try{this.requested=time;this.loadStarted=Date.now();await(this.product==='radar'?this.manager.setMRMSTimestamp(time/1000):this.manager.setSatelliteTimestamp(time/1000));}catch{this.stop();this.emit({message:'Could not load the selected frame. Displayed timestamp is unchanged.'});}}
  step(direction:1|-1){this.stop();const next=nextFrame(this.snapshot.times,this.snapshot.selectedTime,direction,this.options.loop);if(next!==null)void this.seek(next);}
  stop(){if(this.playTimer)clearInterval(this.playTimer);this.playTimer=null;if(this.snapshot.playing)this.emit({playing:false});}
  play(){if(this.snapshot.playing){this.stop();return;}if(this.snapshot.times.length<2)return;this.emit({playing:true});this.playTimer=setInterval(()=>{if(this.snapshot.time!==this.snapshot.selectedTime)return;const next=nextFrame(this.snapshot.times,this.snapshot.selectedTime,1,this.options.loop);if(next===null){this.stop();return;}void this.seek(next);},800);}
}
