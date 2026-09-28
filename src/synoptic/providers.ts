import type { Feature, FeatureCollection } from 'geojson';
import type { Frame, Payload, Product, SceneSettings, WeatherObject } from './model';
export async function response(url:string,signal:AbortSignal) {const r=await fetch(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(30000)]),credentials:'omit',cache:'no-store'});if(!r.ok)throw Error(`Provider HTTP ${r.status}`);return r;}
async function json(url:string,signal:AbortSignal){const v=await (await response(url,signal)).json();if(v.error)throw Error(v.error.message??'Provider error');return v;}
export function timestamp(raw:unknown):number|null {
 if(typeof raw==='number')return raw>1e12&&Number.isFinite(raw)?raw:null;
 if(typeof raw!=='string')return null;
 const advisory=/^(\d{1,2})(\d{2}) (AM|PM) (GMT|UTC) \w{3} (\w{3}) (\d{1,2}) (\d{4})$/.exec(raw);
 if(advisory){const month=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(advisory[5]);if(month<0)return null;return Date.UTC(+advisory[7],month,+advisory[6],(+advisory[1]%12)+(advisory[3]==='PM'?12:0),+advisory[2]);}
 if(/^\d{12}$/.test(raw))return Date.UTC(+raw.slice(0,4),+raw.slice(4,6)-1,+raw.slice(6,8),+raw.slice(8,10),+raw.slice(10,12));
 raw=raw.replace(/^(\d{1,2})(\d{2}) (AM|PM) /,'$1:$2 $3 ');
 const value=Date.parse(String(raw));return Number.isFinite(value)?value:null;
}
function getTime(p:Record<string,unknown>,names:string[]){for(const n of names){const v=Object.entries(p).find(([key])=>key.toLowerCase()===n.toLowerCase())?.[1],t=timestamp(v);if(t!==null)return t;}return null;}
export async function keys(bucket:string,prefix:string,signal:AbortSignal):Promise<string[]> {
 const all:string[]=[];let token='';
 for(let page=0;page<5;page++){
  const u=new URL(bucket);u.search=new URLSearchParams({'list-type':'2',prefix,'max-keys':'1000',...(token?{'continuation-token':token}:{})}).toString();
  const xml=new DOMParser().parseFromString(await(await response(u.href,signal)).text(),'application/xml');
  if(xml.querySelector('parsererror, Error'))throw Error('Invalid NOAA object catalog');
  all.push(...Array.from(xml.getElementsByTagName('Key')).map(n=>n.textContent??''));
  token=xml.getElementsByTagName('NextContinuationToken')[0]?.textContent??'';if(!token)return all;
 }throw Error('NOAA catalog exceeded bounded pagination');
}
export const BUCKETS={rtma:'https://noaa-rtma-pds.s3.amazonaws.com/',urma:'https://noaa-urma-pds.s3.amazonaws.com/',mrms:'https://noaa-mrms-pds.s3.amazonaws.com/',glm:'https://noaa-goes19.s3.amazonaws.com/'};
const day=(time:number)=>new Date(time).toISOString().slice(0,10).replaceAll('-','');
export async function gridFrames(p:Product,signal:AbortSignal):Promise<Frame[]> {
 const type=p.family==='mrms'?'mrms':p.id.startsWith('urma')?'urma':'rtma',bucket=BUCKETS[type];
 const dates=[day(Date.now()),day(Date.now()-86400000)];
 const lists=await Promise.all(dates.map(d=>keys(bucket,type==='mrms'?`CONUS/${p.field}/${d}/`:`${type}2p5.${d}/`,signal)));
 return lists.flat().flatMap(key=>{
  if(type==='mrms'){const m=/_(\d{8})-(\d{6})\.grib2\.gz$/.exec(key);if(!m)return [];const time=Date.UTC(+m[1].slice(0,4),+m[1].slice(4,6)-1,+m[1].slice(6,8),+m[2].slice(0,2),+m[2].slice(2,4),+m[2].slice(4,6));return [{key:bucket+key,time}];}
  const m=/\.(\d{8})\/.*\.t(\d{2})z\.2dvaranl_ndfd\.grb2(?:_wexp)?$/.exec(key);return m?[{key:bucket+key,time:Date.UTC(+m[1].slice(0,4),+m[1].slice(4,6)-1,+m[1].slice(6,8),+m[2])}]:[];
 }).filter(f=>f.time<=Date.now()+60000&&Date.now()-f.time<p.ageMinutes*60000).sort((a,b)=>a.time-b.time).slice(-12);
}
export async function gridBytes(p:Product,frame:Frame,signal:AbortSignal):Promise<ArrayBuffer>{
 if(p.family==='mrms')return(await response(frame.key,signal)).arrayBuffer();
 const idx=await(await response(frame.key+'.idx',signal)).text();const lines=idx.trim().split('\n').map(l=>l.split(':'));
 const index=lines.findIndex(l=>l[3]===p.field&&l[4]===(p.field==='PRES'?'surface':p.field==='WIND'?'10 m above ground':'2 m above ground'));
 if(index<0)throw Error(`NOAA index lacks ${p.field} at required level`);
 const start=Number(lines[index][1]),end=lines[index+1]?Number(lines[index+1][1])-1:undefined;
 if(!Number.isSafeInteger(start)||start<0)throw Error('Invalid GRIB index offset');
 const r=await fetch(frame.key,{signal:AbortSignal.any([signal,AbortSignal.timeout(30000)]),headers:{Range:`bytes=${start}-${end??''}`}});
 if(r.status!==206)throw Error('Provider did not honor bounded GRIB byte range');
 return r.arrayBuffer();
}
async function limitedMap<T,R>(values:T[],work:(value:T)=>Promise<R>):Promise<R[]> {
 const out:R[]=new Array(values.length);let next=0;
 await Promise.all(Array.from({length:Math.min(4,values.length)},async()=>{while(next<values.length){const index=next++;out[index]=await work(values[index]);}}));return out;
}
export async function vectorPayload(p:Product,signal:AbortSignal):Promise<Payload>{
 if(p.kind==='alerts'){
  const all:Feature[]=[];let url='https://api.weather.gov/alerts/active?status=actual&limit=500';
  for(let page=0;page<10&&url;page++){
   if(new URL(url).origin!=='https://api.weather.gov')throw Error('Invalid NWS pagination URL');
   const j=await json(url,signal);if(!Array.isArray(j.features))throw Error('Invalid NWS alerts feed');all.push(...j.features);url=j.pagination?.next??'';
  }
  if(url)throw Error('Incomplete alerts pagination');
  const now=Date.now();const active=all.filter(f=>{const a=f.properties??{},e=timestamp(a.ends)??timestamp(a.expires);return e!==null&&e>now&&(!p.field||String(a.event).includes(p.field))&&(p.id!=='watches'||['Tornado Watch','Severe Thunderstorm Watch'].includes(String(a.event)));});
  const zoneCache=new Map<string,Promise<any>>();
  const features=await limitedMap(active,async f=>{
   const a=f.properties??{};let geometry=f.geometry;
   if(!geometry && Array.isArray(a.affectedZones)){
    const zones=await limitedMap<string,any>(a.affectedZones,async u=>{if(!u.startsWith('https://api.weather.gov/zones/'))throw Error('Invalid alert zone');if(!zoneCache.has(u))zoneCache.set(u,json(u,signal).then(z=>z.geometry));return zoneCache.get(u)!;});
    const polygons=zones.flatMap(g=>g?.type==='Polygon'?[g.coordinates]:g?.type==='MultiPolygon'?g.coordinates:[]);if(polygons.length)geometry={type:'MultiPolygon',coordinates:polygons};
   }
   const event=String(a.event??'Alert'),color=event.includes('Tornado Warning')?'#ff2020':event.includes('Severe Thunderstorm Warning')?'#ffdb00':event.includes('Flash Flood')?'#21d66b':event.includes('Watch')?'#ff932b':'#d050d0';
   return {...f,geometry,properties:{...a,_label:event,_color:color,_expires:timestamp(a.ends)??timestamp(a.expires)}};
  });
  const missing=features.filter(f=>!f.geometry).length;
  return {time:null,expires:Math.min(now+300000,...features.map(f=>Number(f.properties._expires)).filter(Number.isFinite)),timeLabel:'ALERT TIMES VARY',legend:[...new Map(features.map(f=>[f.properties._label,{label:f.properties._label,color:f.properties._color}])).values()],data:{type:'FeatureCollection',features:features.filter(f=>f.geometry)},note:`Active alert snapshot · ${features.length} alerts${missing?` · ${missing} without geometry`:''}; each alert retains its own issuance and expiration`};
 }
 const metadata=await json(p.service+'?f=json',signal);
 const layers=(metadata.layers??[]).filter((l:{name:string;subLayerIds?:number[];type:string})=>!l.subLayerIds&&l.type==='Feature Layer'&&new RegExp(p.match??'','i').test(l.name)&&(!p.id.startsWith('tropical-')||p.id==='tropical-outlook'||(p.id==='tropical-pacific'?/^EP/i.test(l.name):/^AT/i.test(l.name))));
 if(!layers.length)throw Error('Requested official product layers absent from service');
 const features:Feature[]=[];let earliest:number|null=null,expiry:number|null=null;
 const legend:{label:string;color:string}[]=[];
 await limitedMap(layers,async (layer:any)=>{
  const def=await json(`${p.service}/${layer.id}?f=json`,signal),renderer=def.drawingInfo?.renderer;
  const colorOf=(a:any)=>{const value=a?.color;if(!Array.isArray(value))return '#da5e6b';return '#'+value.slice(0,3).map((n:number)=>n.toString(16).padStart(2,'0')).join('');};
  for(const item of renderer?.uniqueValueInfos??[]){const color=colorOf(item.symbol);if(!legend.some(x=>x.label===item.label))legend.push({label:item.label,color});}
  let offset=0;
  while(true){const q=new URLSearchParams({where:'1=1',outFields:'*',returnGeometry:'true',outSR:'4326',f:'geojson',resultOffset:String(offset),resultRecordCount:'1000'});const result=await json(`${p.service}/${layer.id}/query?${q}`,signal);if(result.type!=='FeatureCollection')throw Error('Invalid official GeoJSON');
   for(const f of result.features as Feature[]){const a=Object.fromEntries(Object.entries(f.properties??{}).map(([k,v])=>[k.toUpperCase(),v])),t=getTime(a,['issue_time','ISSUE','ISSUANCE','ADVDATE','DTG','INIT_ISS'] ),e=getTime(a,['expire_time','EXPIRE','END_TIME','VALID_TO','EXPIRES']);if(/^no\s*area$/i.test(String(a.NAME??'')))continue;if(e!==null&&e<Date.now())continue;
    if(t!==null)earliest=earliest===null?t:Math.min(earliest,t);if(e!==null)expiry=expiry===null?e:Math.min(expiry,e);
    const symbol=renderer?.uniqueValueInfos?.find((v:any)=>String(v.value)===String(a[String(renderer.field1).toUpperCase()]))?.symbol??renderer?.symbol;
    features.push({...f,properties:{...a,_layer:layer.name,_color:typeof a.FILL==='string'?a.FILL:colorOf(symbol),_stroke:typeof a.STROKE==='string'?a.STROKE:colorOf(symbol),_label:String(a.DATELBL ? `${a.DATELBL} · ${a.MAXWIND??'—'} kt` : a.LABEL??a.STORMNAME??a.TCWW??layer.name),_expires:e,_issue:t,_valid:getTime(a,['VALID','VALID_TIME']),_storm:a.STORMNAME??null}});
   }
   if(!result.exceededTransferLimit)break;offset+=result.features.length;if(offset>20000||!result.features.length)throw Error('Incomplete official layer pagination');
  }
 });
 if(earliest!==null&&Date.now()-earliest>p.ageMinutes*60000)throw Error('Official product issuance is stale');
 const validTimes=[...new Set(features.map(f=>f.properties?._valid).filter((t):t is number=>typeof t==='number'))];
 return {time:p.family==='tropical'?earliest:validTimes.length===1?validTimes[0]:null,timeLabel:p.family==='tropical'?'ADVISORY':'VALID',expires:Math.min(expiry??Infinity,earliest!==null?earliest+p.ageMinutes*60000:Date.now()+300000),data:{type:'FeatureCollection',features},legend,note:features.length?`${p.source} · ${features.length} features${earliest===null?' · issuance not supplied; inspect feature details':''}`:'No features returned by the official service'};
}
export function parseSurface(text:string,now=Date.now()):Payload {
 const valid=/VALID\s+(\d{2})(\d{2})(\d{2})Z/.exec(text);if(!valid)throw Error('WPC valid time missing');
 const today=new Date(now);
 // CODSUS is MMDDHHZ, not DDHHMMZ.
 const time=[-1,0,1].map(y=>Date.UTC(today.getUTCFullYear()+y,+valid[1]-1,+valid[2],+valid[3])).sort((a,b)=>Math.abs(a-now)-Math.abs(b-now))[0];
 if(time>now+3600000||now-time>6*3600000)throw Error('WPC surface analysis outside validity limit');
 const objects:WeatherObject[]=[];const kinds:Record<string,WeatherObject['kind']>={COLD:'cold',WARM:'warm',STNRY:'stationary',OCFNT:'occluded',TROF:'trough',DRYLINE:'dryline'};
 const coord=(s:string):[number,number]=>[-Number(s.slice(2)),Number(s.slice(0,2))];
 const lines=text.split(/\r?\n/).reduce<string[]>((out,line)=>{if(/^\s+\d/.test(line)&&out.length)out[out.length-1]+=' '+line.trim();else out.push(line);return out;},[]);
 for(const line of lines){const [key,...tokens]=line.trim().split(/\s+/);
  if(key==='HIGHS'||key==='LOWS'){for(let i=0;i+1<tokens.length;i+=2){if(!/^\d{4,5}$/.test(tokens[i+1]))continue;objects.push({id:`wpc-${objects.length}`,kind:key==='HIGHS'?'H':'L',points:[coord(tokens[i+1])],text:tokens[i],origin:'WPC'});}}
  else if(kinds[key]){const points=tokens.filter(t=>/^\d{4,5}$/.test(t)).map(coord);if(points.length>1)objects.push({id:`wpc-${objects.length}`,kind:kinds[key],points,text:'',origin:'WPC'});}
 }
 if(!objects.length)throw Error('No WPC surface objects parsed');return {time,expires:time+6*3600000,objects,note:'WPC analyzed surface positions'};
}
export async function surfacePayload(signal:AbortSignal){
 const list=await json('https://api.weather.gov/products/types/COD',signal);
 const product=(list['@graph']??[]).filter((p:any)=>p.wmoCollectiveId==='ASUS01'&&p.issuingOffice==='KWBC').sort((a:any,b:any)=>Date.parse(b.issuanceTime)-Date.parse(a.issuanceTime))[0];
 if(!product?.id||!/^[a-f0-9-]+$/.test(product.id))throw Error('WPC coded analysis unavailable');
 const body=await json(`https://api.weather.gov/products/${product.id}`,signal);return parseSurface(String(body.productText??''));
}
