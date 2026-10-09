import React from 'react';
import {createRoot} from 'react-dom/client';
import {SynopticShell} from '../../src/synoptic/Scene';
import '../../src/synoptic/synoptic.css';
import '../../src/broadcast-graphics/barLibrary.css';
import {Map,setWorkerUrl} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
setWorkerUrl(workerUrl);
import 'maplibre-gl/dist/maplibre-gl.css';
import {SynopticRuntime} from '../../src/synoptic/runtime';
import {PRODUCTS,defaults} from '../../src/synoptic/model';
import {QpfController} from '../../src/qpf/controller';
import {CurrentWeatherController} from '../../src/current-weather/controller';
import {defaultOptions} from '../../src/current-weather/model';
const map=new Map({container:'map',style:{version:8,glyphs:'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#102030'}}]},center:[-98,35],zoom:3,canvasContextAttributes:{preserveDrawingBuffer:true},attributionControl:false});
const overlay=document.createElement('div');overlay.className='rbrwx-broadcast-workspace';overlay.style.cssText='position:absolute;width:960px;height:600px;pointer-events:none';document.body.appendChild(overlay);const root=createRoot(overlay);
const ready=new Promise<void>(resolve=>map.on('load',()=>resolve()));
let cleanup=()=>{};
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
function pixels(){const canvas=map.getCanvas(),copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;const ctx=copy.getContext('2d')!;ctx.drawImage(canvas,0,0);const d=ctx.getImageData(0,0,copy.width,copy.height).data;let colored=0;for(let i=0;i<d.length;i+=4)if(Math.abs(d[i]-16)+Math.abs(d[i+1]-32)+Math.abs(d[i+2]-48)>25)colored++;return colored;}
async function settled(){map.triggerRepaint();await pause(800);for(let i=0;i<120&&!map.loaded();i++)await pause(250);map.triggerRepaint();await pause(100);}
(window as any).audit={
 products:PRODUCTS.map(p=>({id:p.id,kind:p.kind})),
 async product(id:string){await ready;cleanup();root.render(null);const p=PRODUCTS.find(p=>p.id===id)!;const runtime=new SynopticRuntime(snapshot=>root.render(React.createElement(SynopticShell,{snapshot,map})));runtime.select(p,{...defaults(),opacity:1,background:p.id.endsWith('-radar')?'radar':p.id.endsWith('-satellite')?'satellite':'none'});const release=runtime.connect(map);cleanup=release;try{for(let i=0;i<180;i++){await pause(1000);if(runtime.snapshot.payload||runtime.snapshot.status.startsWith('UNAVAILABLE'))break;}await settled();const s=runtime.snapshot;const result={id,status:s.status,loaded:!!s.payload,time:s.payload?.time,frames:s.frames.length,features:s.payload?.data?.features.length??0,objects:s.payload?.objects?.length??0,pixels:pixels(),layers:map.getStyle().layers.length,image:!!s.payload?.image};return result;}catch(error){release();throw error;}},
 async qpf(id:string){await ready;cleanup();root.render(null);let snapshot:any={};const c=new QpfController(s=>{snapshot=s;});const release=c.connect(map);cleanup=()=>{release();c.destroy();};try{c.select(id as any,.8);for(let i=0;i<120;i++){await pause(1000);if(snapshot.issueTime||snapshot.message?.includes('unavailable'))break;}await settled();return{id,...snapshot,pixels:pixels()};}catch(error){cleanup();throw error;}},
 async imagery(product:'radar'|'satellite'|'observations'){await ready;cleanup();root.render(null);map.jumpTo({center:[-98,35],zoom:product==='observations'?5:3});const c=new CurrentWeatherController(()=>{});const release=c.connect(map);cleanup=()=>{release();c.destroy();};try{c.select('audit',product,defaultOptions(),'');for(let i=0;i<100;i++){await pause(1000);if(['fresh','unavailable','cached','stale'].includes(c.snapshot.status))break;}await settled();return {id:product,status:c.snapshot.status,message:c.snapshot.message,time:c.snapshot.time,frames:c.snapshot.times.length,observations:c.snapshot.observations.length,paintedReports:(map.getSource('rbrwx-current-observations') as any)?._data?.features?.length??0,pixels:pixels()};}catch(error){cleanup();throw error;}},
 async faults(){await ready;cleanup();root.render(null);const p=PRODUCTS.find(p=>p.id==='rtma-temperature')!,c=new SynopticRuntime(()=>{});const release=c.connect(map);try{c.renderSnapshot({productId:p.id,settings:defaults(),payload:{time:Date.now()-99999999,expires:Date.now()-1,data:{type:'FeatureCollection',features:[]}},status:'expired test',frames:[],index:0});await settled();return {expiredLayers:map.getStyle().layers.filter(l=>l.id.startsWith('rbrwx-synoptic')).length};}finally{release();}},
};
