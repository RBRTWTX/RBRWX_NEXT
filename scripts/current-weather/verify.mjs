import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire}from'node:module';
const root=new URL('../../',import.meta.url),require=createRequire(import.meta.url),ts=require('../broadcast/vendor/typescript/typescript.cjs');
const manifest=JSON.parse(fs.readFileSync(new URL('scripts/current-weather/payload-manifest.json',root),'utf8'));
for(const [file,digest] of Object.entries(manifest.files))assert.equal(createHash('sha256').update(fs.readFileSync(new URL(file,root))).digest('hex'),digest,`Current Weather integrity: ${file}`);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rbrwx-current-test-'));
try{
 for(const file of ['model','observations','public-imagery','controller']){const input=fs.readFileSync(new URL(`src/current-weather/${file}.ts`,root),'utf8');fs.writeFileSync(path.join(temp,file+'.js'),ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText);}
 fs.copyFileSync(new URL('src/current-weather/palettes.json',root),path.join(temp,'palettes.json'));
 const m=require(path.join(temp,'model.js')),o=require(path.join(temp,'observations.js')), {CurrentWeatherController}=require(path.join(temp,'controller.js'));
 const now=Date.now();assert.equal(m.freshness(null,15),'unavailable');assert.equal(m.freshness(now+600000,15),'unavailable');assert.equal(m.freshness(now-3600000,15,true),'stale');assert.equal(m.freshness(now,15,true),'cached');assert.equal(m.freshness(now,15),'fresh');
 assert.equal(m.temperature(null,'imperial'),'—');assert.equal(m.temperature(0,'imperial'),'32°F');assert.equal(m.temperature(25,'metric'),'25°C');assert.equal(m.wind(16.09344,'imperial'),'10 mph');assert.equal(m.wind(null,'metric'),'—');
 assert.deepEqual(m.frameTimes([1700000001,1700000000,1700000001,null,NaN]),[1700000000000,1700000001000]);assert.equal(m.nextFrame([1,2,3],3,1,false),null);assert.equal(m.nextFrame([1,2,3],3,1,true),1);assert.equal(m.nextFrame([1,2,3],1,-1,true),3);
 const observation=o.parseObservation({properties:{timestamp:new Date(now).toISOString(),temperature:{value:0,unitCode:'wmoUnit:degC'},windSpeed:{value:5,unitCode:'wrong'},windGust:{value:null,unitCode:'wmoUnit:km_h-1'},dewpoint:{value:20,unitCode:'wmoUnit:degC',qualityControl:'X'}}},{id:'KSAT',name:'San Antonio',lng:-98.4,lat:29.5});
 assert.equal(observation.temperature,0);assert.equal(observation.wind,null);assert.equal(observation.gust,null);assert.equal(observation.dewpoint,null);assert.equal(o.parseObservation({properties:{}},{}),null);
 const originalFetch=globalThis.fetch;
 let failNetwork=false;
 globalThis.fetch=async url=>{ if(failNetwork)throw Error('offline'); const address=String(url); let body;
   if(address.includes('/points/')) body={properties:{observationStations:'https://api.weather.gov/gridpoints/EWX/1,1/stations'}};
   else if(address.endsWith('/stations')) body={features:[{properties:{stationIdentifier:'KSAT',name:'San Antonio'},geometry:{coordinates:[-98.4,29.5]}}]};
   else body={properties:{timestamp:new Date(now).toISOString(),temperature:{value:27,unitCode:'wmoUnit:degC'},windSpeed:{value:16.668,unitCode:'wmoUnit:km_h-1'}}};
   return new Response(JSON.stringify(body),{status:200});
 };
 try { const client=new o.ObservationsClient(),signal=new AbortController().signal; const live=await client.load(-98.4,29.5,signal);assert.equal(live[0].wind,16.668);failNetwork=true;const cached=await client.load(-98.4,29.5,signal);assert.equal(cached[0].cached,true);assert.equal(cached[0].time,live[0].time);await assert.rejects(()=>client.load(-100,31,signal)); }
 finally {globalThis.fetch=originalFetch;}
 const palettes=JSON.parse(fs.readFileSync(new URL('src/current-weather/palettes.json',root),'utf8'));
 assert.equal(palettes.keys[0].id,'noaa.nowcoast.reflectivity');assert.equal(palettes.keys[0].unit,'dBZ');assert.equal(palettes.keys[1].unit,'image level');
 for(const [index,product]of ['radar','satellite'].entries()) {
   const legend=JSON.parse(fs.readFileSync(new URL(`scripts/current-weather/fixtures/${product}-legend.json`,root),'utf8'));
   const entries=legend.Legend[0].rules[0].symbolizers[0].Raster.colormap.entries.filter(e=>e.label!=='nodata');
   assert.equal(palettes.keys[index].bins.length,entries.length);
   entries.forEach((entry,i)=>{const bin=palettes.keys[index].bins[i];assert.equal(bin.value,entry.quantity);assert.deepEqual(bin.rgba,[...entry.color.slice(1).match(/../g).map(v=>parseInt(v,16)),Math.round(Number(entry.opacity??1)*255)]);});
 }
 const imagery=require(path.join(temp,'public-imagery.js'));
 const url=new URL(imagery.imageRequest('radar',1700000000000,[-1,-2,3,4],1000,600));
 assert.equal(url.hostname,'nowcoast.noaa.gov');assert.equal(url.searchParams.get('SRS'),'EPSG:3857');assert.equal(url.searchParams.get('BBOX'),'-1,-2,3,4');assert.equal(url.searchParams.get('TIME'),'2023-11-14T22:13:20.000Z');assert.equal(url.searchParams.has('apiKey'),false);

 globalThis.document={baseURI:'http://localhost:1420/'};
 const fakeMap={off(){},on(){},getLayer(){return undefined},getSource(){return undefined}};
 let resolveFirst;let destroyed=0,initializations=0;
 const manager={core:{cancelAllRequests(){}},destroy(){destroyed++},initialize(){initializations++;return Promise.resolve()},on(){},setOpacity(){return Promise.resolve()},setUnits(){return Promise.resolve()},currentLoadedTimeKey:null,satelliteLayer:null};
 const controller=new CurrentWeatherController(()=>{},()=>new Promise(resolve=>{resolveFirst=resolve}));
 const detach=controller.connect(fakeMap,'anchor');controller.select('radar','radar',m.defaultOptions(),'test-only');controller.select('map','map',m.defaultOptions(),'');resolveFirst(manager);await new Promise(resolve=>setTimeout(resolve,0));assert.equal(destroyed,1);assert.equal(initializations,0);assert.equal(controller.snapshot.status,'off');detach();controller.destroy();
 let keylessCalls=0;const noKey=new CurrentWeatherController(()=>{},async()=>{keylessCalls++;return manager});noKey.connect(fakeMap,'anchor');noKey.select('radar','radar',m.defaultOptions(),'');await new Promise(resolve=>setTimeout(resolve,0));assert.equal(keylessCalls,1);assert.notEqual(noKey.snapshot.status,'setup');noKey.destroy();
 console.log('Current weather PASS: timestamp freshness, missing/unit/QC handling, timeline/loop boundaries, palettes, stale async cancellation and keyless public provider initialization and explicit WMS frame/coordinate requests.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
