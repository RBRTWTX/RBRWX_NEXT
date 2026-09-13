import type { Map as WeatherMap } from 'maplibre-gl';
export type ImageryProduct = 'radar' | 'satellite';
export const services = {
  radar: { url:'https://nowcoast.noaa.gov/geoserver/observations/weather_radar/wms', layer:'conus_base_reflectivity_mosaic' },
  satellite: { url:'https://nowcoast.noaa.gov/geoserver/satellite/wms', layer:'goes_longwave_imagery' },
} as const;
export function publishedTimes(xml:string, layer:string):number[] {
  const doc=new DOMParser().parseFromString(xml,'application/xml');
  if(doc.querySelector('parsererror')) throw Error('NOAA returned invalid capabilities XML');
  const node=Array.from(doc.getElementsByTagNameNS('*','Layer')).find(l=>Array.from(l.children).some(c=>c.localName==='Name'&&c.textContent===layer));
  if(!node) throw Error('NOAA weather layer is absent from capabilities');
  const dimension=Array.from(node.children).find(c=>c.localName==='Dimension'&&c.getAttribute('name')==='time');
  const times=(dimension?.textContent??'').split(',').map(s=>Date.parse(s.trim())).filter(Number.isFinite);
  if(!times.length) throw Error('NOAA has no explicit published frames for this layer');
  return [...new Set(times)].sort((a,b)=>a-b).slice(-12);
}
export function imageRequest(product:ImageryProduct,time:number,bounds:number[],width:number,height:number):string {
  const s=services[product], u=new URL(s.url);
  const p={SERVICE:'WMS',VERSION:'1.1.1',REQUEST:'GetMap',LAYERS:s.layer,STYLES:'',FORMAT:'image/png',TRANSPARENT:'TRUE',SRS:'EPSG:3857',BBOX:bounds.join(','),WIDTH:String(width),HEIGHT:String(height),TIME:new Date(time).toISOString()};
  for(const [k,v]of Object.entries(p))u.searchParams.set(k,v);
  return u.href;
}
async function request(url:string,signal:AbortSignal) {
  const response=await fetch(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(20000)]),credentials:'omit'});
  if(!response.ok) throw Error(`NOAA HTTP ${response.status}`);
  return response;
}
function dataURL(blob:Blob):Promise<string> {return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('Could not decode NOAA image'));reader.readAsDataURL(blob);});}
export interface PublicImageryOptions { product:ImageryProduct; anchor:string; opacity:number; onError:(message:string)=>void }
/** Two image sources keep the last completed frame visible until its replacement loads. */
export class PublicImagery {
  currentLoadedTimeKey:number|null=null;
  private times:number[]=[];
  private selected:number|null=null;
  private listener:((state:Record<string,unknown>)=>void)|null=null;
  private lifetime=new AbortController();
  private frame:AbortController|null=null;
  private serial=0;
  private active:string|null=null;
  private owned=new Set<string>();
  private moveTimer:ReturnType<typeof setTimeout>|null=null;
  private pending=false;
  private opacity:number;
  private prefix=`rbrwx-public-${Math.random().toString(36).slice(2)}`;
  constructor(private map:WeatherMap,private options:PublicImageryOptions){this.opacity=options.opacity;}
  on(_event:string,listener:(state:Record<string,unknown>)=>void){this.listener=listener;}
  private emit(){this.listener?.({availableTimestamps:this.times,mrmsTimestamp:this.selected});}
  async initialize(){this.map.on('moveend',this.move);this.map.on('resize',this.move);await this.refreshData();}
  async refreshData(){
    const s=services[this.options.product];
    const response=await request(`${s.url}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities`,this.lifetime.signal);
    const times=publishedTimes(await response.text(),s.layer);
    if(this.lifetime.signal.aborted)return;
    this.times=times;this.emit();
    await this.load(times[times.length-1]);
  }
  private move=()=>{if(this.moveTimer)clearTimeout(this.moveTimer);this.moveTimer=setTimeout(()=>{if(this.selected!==null)void this.load(this.selected).catch(e=>this.options.onError(e instanceof Error?e.message:'NOAA image failed'));},400);};
  async setMRMSTimestamp(time:number){await this.load(time*1000);}
  async setSatelliteTimestamp(time:number){await this.load(time*1000);}
  async setUnits(_units:string){}
  async setOpacity(value:number){this.opacity=value;if(this.active&&this.map.getLayer(this.active))this.map.setPaintProperty(this.active,'raster-opacity',value);}
  private remove(id:string){if(this.map.getLayer(id))this.map.removeLayer(id);if(this.map.getSource(id))this.map.removeSource(id);this.owned.delete(id);}
  private async load(time:number){
    if(this.lifetime.signal.aborted||!this.times.includes(time))return;
    this.frame?.abort();const frame=new AbortController();this.frame=frame;
    const signal=AbortSignal.any([frame.signal,this.lifetime.signal]);const serial=++this.serial;
    this.selected=time;this.pending=true;this.emit();
    const b=this.map.getBounds(), west=Math.max(-180,b.getWest()),east=Math.min(180,b.getEast()),south=Math.max(-85,b.getSouth()),north=Math.min(85,b.getNorth());
    if(west>=east||south>=north)throw Error('Move the map into the NOAA coverage area');
    const mercX=(lng:number)=>lng*20037508.342789244/180;
    const mercY=(lat:number)=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))*6378137;
    const canvas=this.map.getCanvas(),scale=Math.min(1,1536/Math.max(canvas.width,canvas.height));
    const width=Math.max(64,Math.round(canvas.width*scale)),height=Math.max(64,Math.round(canvas.height*scale));
    let id:string|null=null;
    try {
      const response=await request(imageRequest(this.options.product,time,[mercX(west),mercY(south),mercX(east),mercY(north)],width,height),signal);
      if(!response.headers.get('content-type')?.toLowerCase().includes('image/png'))throw Error('NOAA returned a service error instead of an image');
      const blob=await response.blob();if(blob.size<8)throw Error('NOAA returned an empty image');
      const url=await dataURL(blob);if(signal.aborted||serial!==this.serial)return;
      id=`${this.prefix}-${serial}`;const next=id;this.owned.add(next);
      await new Promise<void>((resolve,reject)=>{
        const timer=setTimeout(()=>finish(Error('NOAA image could not be drawn within 20 seconds')),20000);
        const cleanup=()=>{clearTimeout(timer);this.map.off('sourcedata',loaded);this.map.off('error',failed);signal.removeEventListener('abort',cancel);};
        const finish=(error?:Error)=>{cleanup();error?reject(error):resolve();};
        const loaded=(e:{sourceId?:string;isSourceLoaded?:boolean})=>{if(e.sourceId===next&&e.isSourceLoaded)finish();};
        const failed=(e:{type:string;sourceId?:string})=>{if(e.sourceId===next)finish(Error('NOAA image decoding failed'));};
        const cancel=()=>finish(new DOMException('Cancelled','AbortError'));
        this.map.on('sourcedata',loaded);this.map.on('error',failed);signal.addEventListener('abort',cancel,{once:true});
        try {this.map.addSource(next,{type:'image',url,coordinates:[[west,north],[east,north],[east,south],[west,south]]});this.map.addLayer({id:next,type:'raster',source:next,paint:{'raster-opacity':0,'raster-fade-duration':0}},this.options.anchor);}
        catch(e){finish(e instanceof Error?e:Error('Could not add NOAA imagery'));}
      });
      if(signal.aborted||serial!==this.serial)return;
      const old=this.active;this.active=next;this.map.setPaintProperty(next,'raster-opacity',this.opacity);
      if(old)this.remove(old);
      // Report a completed image only after MapLibre renders the new source.
      await new Promise<void>(resolve=>{const done=()=>{this.map.off('render',done);signal.removeEventListener('abort',done);resolve();};this.map.once('render',done);signal.addEventListener('abort',done,{once:true});this.map.triggerRepaint();});
      if(!signal.aborted&&serial===this.serial){this.currentLoadedTimeKey=time;this.pending=false;}
    } catch(e){if(!signal.aborted)throw e;}
    finally {if(id&&id!==this.active)this.remove(id);if(serial===this.serial)this.pending=false;}
  }
  get loading(){return this.pending;}
  destroy(){this.lifetime.abort();this.frame?.abort();if(this.moveTimer)clearTimeout(this.moveTimer);this.map.off('moveend',this.move);this.map.off('resize',this.move);for(const id of [...this.owned])this.remove(id);this.listener=null;}
}
