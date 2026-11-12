// Offline browser regression. Real canvas encoding, station interpolation and React mirror;
// only the weather provider, MapLibre source setters and native bridge are substituted.
import {flushSync} from 'react-dom';
import {useSceneRecords} from '../../src/broadcast-graphics/sceneDocuments';
import {SynopticRuntime} from '../../src/synoptic/runtime';
import {defaults} from '../../src/synoptic/model';
import {createRoot} from 'react-dom/client';
import {CurrentWeatherController} from '../../src/current-weather/controller';
import {defaultOptions} from '../../src/current-weather/model';
import {ProgramMirror,useProgramMirror,type MirrorFrame} from '../../src/broadcast-host/ProgramMirror';

const wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
(window as any).measureResponsiveness=async()=>{
  let raster=0,labels=0,notices=0,lastRaster='',lastLabels=0,west=-101;
  const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
  const map={getBounds:()=>({getWest:()=>west,getEast:()=>west+5,getSouth:()=>27,getNorth:()=>32}),getCanvas:()=>canvas,getZoom:()=>8,getLayer:()=>true,setPaintProperty(){},
    getSource:()=>({setData:(v:any)=>{labels++;lastLabels=v.features.length;},updateImage:(v:any)=>{raster++;lastRaster=v.url;}})};
  const c:any=new CurrentWeatherController(()=>notices++);c.map=map;c.product='observations';c.options=defaultOptions();
  c.snapshot.observations=Array.from({length:96},(_,i)=>({id:'S'+i,lng:-101+(i%12)*.4,lat:27+Math.floor(i/12)*.6,time:Date.now()-60000,temperature:10+(i%19),cached:false}));
  c.drawObservations();const initial=lastRaster;
  raster=labels=notices=0;const start=performance.now();
  for(let i=0;i<8;i++)c.drawObservations();
  const unchanged={raster,labels,notices,milliseconds:Math.round(performance.now()-start)};
  raster=labels=0;c.options={...c.options,units:'metric'};c.drawObservations();const units={raster,labels};
  raster=labels=0;west+=.2;c.drawObservations();const pan={raster,labels};
  c.snapshot.observations=c.snapshot.observations.map((o:any)=>({...o,time:Date.now()-4*3600000}));c.drawObservations();
  async function readPixel(url:string){const image=new Image();image.src=url;await image.decode();const a=document.createElement('canvas');const ctx=a.getContext('2d')!;ctx.drawImage(image,0,0);return [...ctx.getImageData(0,0,1,1).data];}
  const expiredPixels=(await readPixel(lastRaster))[3],expiredLabels=lastLabels;
  const rasterHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(initial))),v=>v.toString(16).padStart(2,'0')).join('');

  const stage=document.createElement('div');stage.className='operator-canvas-stage';stage.style.cssText='width:1280px;height:720px';stage.append(canvas);document.body.append(stage);
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='red';ctx.fillRect(0,0,1280,720);
  let listener:undefined|(()=>void);const fakeMap:any={on:(_:string,fn:()=>void)=>{listener=fn;},off:()=>{listener=undefined;},getCanvas:()=>canvas,triggerRepaint:()=>listener?.()};
  let syncMirrorEncodes=0;const orig=HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL=function(...args){syncMirrorEncodes++;return orig.apply(this,args);};
  const mount=document.querySelector('#root')!;const root=createRoot(mount);let latest:MirrorFrame|undefined;
  function Sender(){useProgramMirror(fakeMap,true,async frame=>{latest=frame;});return null;}
  try{
    root.render(<Sender/>);await wait(400);const firstMirrorImage=!!latest?.mapImage,first=latest?.mapImage;
    ctx.fillStyle='green';ctx.fillRect(0,0,1280,720);listener?.();await wait(400);
    if(!latest?.mapImage)throw Error('No mirrored map');
    const frame=latest,finalMirrorImageChanged=latest.mapImage!==first,lastImagePixel=(await readPixel(latest.mapImage)).join(',');
    root.render(<ProgramMirror frame={frame}/>);await wait(150);const before=mount.querySelector('img');
    root.render(<ProgramMirror frame={{...frame,time:Date.now()+100}}/>);await wait(100);
    const after=mount.querySelector('img');const sameMirrorNode=!!before&&before===after;
    let unrelatedRenders=0;let writeTitle!:()=>void,undoTitle!:()=>void;
    function Title(){const [records,set,history]=useSceneRecords<string>('bench-title',()=>({scene:'Original'}));
      writeTitle=()=>set({scene:'New'});undoTitle=()=>history('scene','undo','Original');return <span>{records.scene}</span>;}
    function Forecast(){useSceneRecords('bench-forecast',()=>({scene:'Local'}));unrelatedRenders++;return null;}
    flushSync(()=>root.render(<><Title/><Forecast/></>));const renderStart=unrelatedRenders;
    flushSync(()=>writeTitle());flushSync(()=>undoTitle());const undoWorked=mount.textContent==='Original';
    const runtime:any=new SynopticRuntime(()=>{});let mapWrites=0;
    runtime.map={getLayer:()=>true,setFilter:()=>mapWrites++,setPaintProperty:()=>mapWrites++,setLayoutProperty:()=>mapWrites++};
    const settings=defaults();runtime.select(null,{...settings,title:'Edited title'});const titleOnlyStyleWrites=mapWrites;
    runtime.select(null,{...settings,opacity:.42});const changedOpacityWrites=mapWrites-titleOnlyStyleWrites;
    return {unrelatedEditorRenders:unrelatedRenders-renderStart,undoWorked,titleOnlyStyleWrites,changedOpacityWrites,unchanged,units,pan,expiredPixels,expiredLabels,rasterHash,syncMirrorEncodes,firstMirrorImage,finalMirrorImageChanged,lastImagePixel,sameMirrorNode,mirrorImageSurvivesHeartbeat:after?.getAttribute('src')===frame.mapImage};
  }finally{root.unmount();stage.remove();HTMLCanvasElement.prototype.toDataURL=orig;}
};
