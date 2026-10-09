import { splitMessages, parseFields, parseProduct, parseGrid, nearestGridpoint, decodeFieldValues } from '@azohra/meteo.grib';
import {analyzedObjects} from './contours';
import {colorFor} from './palette';
import { decodeGrid } from './decode';
import type { Product } from './model';
self.onmessage = async (event: MessageEvent<{bytes:ArrayBuffer;product:Product;bounds:number[];width:number;height:number}>) => {
 try {
  const { product:p,bounds:[west,south,east,north],width,height }=event.data;
  let bytes=new Uint8Array(event.data.bytes);
  if(bytes[0]===31&&bytes[1]===139) bytes=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  const fields=splitMessages(bytes).flatMap(parseFields);
  const match:Record<string,[number,number]>={TMP:[0,0],DPT:[0,6],WIND:[2,1],PRES:[3,0],REFC:[16,196]};
  const f=fields.find(f=> {const d=parseProduct(f.section4),want=match[p.field??''];return !want || (f.discipline===0 && d.parameterCategory===want[0]&&d.parameterNumber===want[1]);});
  if(!f) throw Error('Requested analyzed quantity absent from GRIB');
  const section=f.section3.slice(),v=new DataView(section.buffer);
  // MRMS spells the standard microdegree angle as 1 / 1,000,000.
  if(v.getUint16(12)===0 && v.getUint32(38)===1&&v.getUint32(42)===1000000){v.setUint32(38,0);v.setUint32(42,0xffffffff);}
  const regular=v.getUint16(12)===0;
  const grid=regular?null:parseGrid(section), decoded=decodeGrid(f);
  const signed=(off:number)=>{const n=v.getUint32(off);return (n&0x80000000)?-(n&0x7fffffff):n;};
  const ni=regular?v.getUint32(30):0,nj=regular?v.getUint32(34):0,scan=regular?v.getUint8(71):0;
  if(regular&&(scan&0x3f)!==0)throw Error('Unsupported regular-grid scan order');
  const lat0=regular?signed(46)/1e6:0,lon0=regular?v.getUint32(50)/1e6:0,dx=regular?v.getUint32(63)/1e6:0,dy=regular?v.getUint32(67)/1e6:0;
  const t=f.identification,time=Date.UTC(t.year,t.month-1,t.day,t.hour,t.minute,t.second);
  const definition=parseProduct(f.section4),unit=definition.indicatorOfUnitOfTimeRange,step=unit===1?3600000:unit===0?60000:unit===13?1000:NaN;
  const validTime=time+(definition.forecastTime??0)*step;if(p.family==='futurecast'&&!Number.isFinite(validTime))throw Error('Unsupported forecast time unit');
  const rgba=new Uint8ClampedArray(width*height*4),values=new Float32Array(width*height).fill(NaN);
  const merc=(lat:number)=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));const yn=merc(north),ys=merc(south);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const lat=(2*Math.atan(Math.exp(yn+(ys-yn)*(y+.5)/height))-Math.PI/2)*180/Math.PI,lng=west+(east-west)*(x+.5)/width;
   let index:number;
   if(regular){const lon=(lng+360)%360,i=Math.round((lon-lon0)/(scan&128?-dx:dx)),j=Math.round((lat-lat0)/(scan&64?dy:-dy));if(i<0||j<0||i>=ni||j>=nj)continue;index=j*ni+i;}
   else{const point=nearestGridpoint(grid!,lat,lng);if(point.distanceKm>5)continue;index=point.index;}
   let value=decoded[index];if(!Number.isFinite(value)||value<=-99)continue;
   if(p.units==='°F')value=(value-273.15)*1.8+32;
   if(p.units==='s⁻¹')value/=1000;
   if(p.units==='mph')value*=2.236936;
   if(p.units==='hPa')value/=100;
   if(p.units==='in'||p.units==='in/hr')value/=25.4;
   if(p.units==='kft')value*=3.28084;
   values[y*width+x]=value;
   const color=colorFor(p,value);if(!color)continue;
   const off=(y*width+x)*4;for(let c=0;c<3;c++)rgba[off+c]=color[c];rgba[off+3]=255;
  }
  const interval=p.units==='hPa'?10:10;const [lo,hi]=p.range??[0,100];const levels=Array.from({length:Math.floor((hi-lo)/interval)+1},(_,i)=>lo+i*interval);
  const data=p.family==='analysis'?analyzedObjects(values,width,height,[west,south,east,north],levels):undefined;
  self.postMessage({time,validTime,rgba,width,height,data}, {transfer:[rgba.buffer]});
 } catch(error){self.postMessage({error:error instanceof Error?error.message:String(error)});}
};
