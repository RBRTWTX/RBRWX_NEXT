import type {Frame, Product} from './model';
import {keys} from './providers';
export const HRRR_BUCKET='https://noaa-hrrr-bdp-pds.s3.amazonaws.com/';
export const HRRR_MAX_RUN_AGE=6*3600000;
export function hrrrFrames(catalog:string[],now=Date.now()):Frame[] {
 const runs=new Map<number,Frame[]>();
 for(const key of catalog){const m=/hrrr\.(\d{4})(\d{2})(\d{2})\/conus\/hrrr\.t(\d{2})z\.wrfsfcf(\d{2})\.grib2$/.exec(key);if(!m)continue;
  const run=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4]),hour=+m[5];
  if(run>now||now-run>HRRR_MAX_RUN_AGE||hour>18)continue;
  const frames=runs.get(run)??[];frames.push({time:run+hour*3600000,runTime:run,forecastHour:hour,key:HRRR_BUCKET+key});runs.set(run,frames);
 }
 // Never mix forecast cycles or silently interpolate missing hours.
 for(const [,frames]of [...runs].sort(([a],[b])=>b-a)){frames.sort((a,b)=>a.time-b.time);if(frames.length===19&&frames.every((f,i)=>f.forecastHour===i))return frames;}
 throw Error('No complete fresh HRRR 0–18 hour run published');
}
export async function discoverHrrr(signal:AbortSignal):Promise<Frame[]> {
 const now=Date.now(),dates=[now,now-86400000].map(t=>new Date(t).toISOString().slice(0,10).replaceAll('-',''));
 // Narrow per-cycle prefixes avoid pulling all pressure-level catalogs.
 const catalogs:string[][]=[];
 for(let age=1;age<=6;age++){
  const run=Math.floor(now/3600000)*3600000-age*3600000,d=new Date(run),date=d.toISOString().slice(0,10).replaceAll('-','');
  const list=await keys(HRRR_BUCKET,`hrrr.${date}/conus/hrrr.t${String(d.getUTCHours()).padStart(2,'0')}z.wrfsfcf`,signal);catalogs.push(list);
  try{return hrrrFrames(catalogs.flat(),now);}catch{/* A partially uploaded run is not usable; try the preceding run. */}
 }
 throw Error('HRRR unavailable: no complete recent cycle');
}
export function checkModelTime(product:Product,frame:Frame,run:number,valid:number,now=Date.now()) {
 if(product.family!=='futurecast')return;
 if(frame.runTime===undefined||now-frame.runTime>HRRR_MAX_RUN_AGE)throw Error('HRRR run expired');
 if(run!==frame.runTime||valid!==frame.time)throw Error('HRRR GRIB run/valid time differs from advertised frame');
}
