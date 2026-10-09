import{useEffect,useRef,useState}from'react';
import type{Map as WeatherMap}from'maplibre-gl';
export interface MirrorFrame{html:string;mapImage?:string;width:number;height:number;time:number}
// Only application-rendered passive markup crosses the local canvas bridge.
export function passiveMarkup(root:HTMLElement){
 root.querySelectorAll('script,iframe,object,embed,audio,video,link,style,.canvas-hidden-menu,.forecast-add-menu,.forecast-asset-library,.forecast-editor-hint,.onair-tool-hint,.wx-edge,.wx-inline-controls,.forecast-inline-controls,.forecast-resize-handle').forEach(n=>n.remove());
 root.querySelectorAll('*').forEach(node=>{for(const a of [...node.attributes])if(/^on/i.test(a.name)||['contenteditable','tabindex','autofocus'].includes(a.name)||(/^(href|src|xlink:href)$/i.test(a.name)&&/^\s*javascript:/i.test(a.value)))node.removeAttribute(a.name);});
 return root.innerHTML;
}
export function useProgramMirror(map:WeatherMap|null,enabled:boolean,publish:(frame:MirrorFrame)=>Promise<unknown>,controlKey=''){
 const latest=useRef(publish),controls=useRef(controlKey);latest.current=publish;controls.current=controlKey;
 useEffect(()=>{if(!enabled)return;let busy=false,stopped=false,mapImage='',mapDirty=true,domDirty=true,html='',lastSend=0,lastCapture=0,lastControls='';let trailing:ReturnType<typeof setTimeout>|undefined;const retained=document.createElement('canvas');
 const stage=document.querySelector<HTMLElement>('.operator-canvas-stage');if(!stage)return;
 const mutation=new MutationObserver(records=>{if(records.some(r=>!(r.target as Element).closest?.('.canvas-hidden-menu')))domDirty=true;});mutation.observe(stage,{subtree:true,childList:true,attributes:true,characterData:true});
 const resize=new ResizeObserver(()=>{domDirty=true;});resize.observe(stage);
 const rendered=()=>{const now=performance.now();if(now-lastCapture<100){if(!trailing)trailing=setTimeout(()=>{trailing=undefined;if(!stopped)map?.triggerRepaint();},Math.ceil(100-(now-lastCapture)));return;}if(trailing){clearTimeout(trailing);trailing=undefined;}lastCapture=now;const source=map?.getCanvas();if(!source?.width)return;try{if(retained.width!==source.width||retained.height!==source.height){retained.width=source.width;retained.height=source.height;}retained.getContext('2d')?.drawImage(source,0,0);mapDirty=true;}catch{mapImage='';}};
 map?.on('render',rendered);map?.triggerRepaint();
 const send=async()=>{if(stopped||busy)return;if(!domDirty&&!mapDirty&&lastControls===controls.current&&Date.now()-lastSend<1000)return;busy=true;try{
  if(mapDirty&&retained.width&&retained.height){mapImage=retained.toDataURL('image/png');mapDirty=false;}
  if(domDirty){const copy=stage.cloneNode(true) as HTMLElement;
   copy.querySelectorAll('canvas').forEach(canvas=>{const image=document.createElement('img');image.className=canvas.className;image.setAttribute('style',canvas.getAttribute('style')??'');image.dataset.mirrorMap='true';image.alt='';canvas.replaceWith(image);});
   const crawls=stage.querySelectorAll<HTMLElement>('.ewx-alert-crawl,.wxg-crawl');copy.querySelectorAll<HTMLElement>('.ewx-alert-crawl,.wxg-crawl').forEach((node,i)=>{const time=Number(crawls[i]?.getAnimations()[0]?.currentTime??0);node.style.animationDelay=`-${time}ms`;});
   html=passiveMarkup(copy);domDirty=false;
  }
  const rect=stage.getBoundingClientRect(),sentControls=controls.current;await latest.current({html,mapImage,width:rect.width,height:rect.height,time:Date.now()});lastSend=Date.now();lastControls=sentControls;
 }catch{domDirty=true;mapDirty=true;}finally{busy=false;}};
 const timer=setInterval(()=>void send(),100);void send();return()=>{stopped=true;clearInterval(timer);if(trailing)clearTimeout(trailing);mutation.disconnect();resize.disconnect();map?.off('render',rendered);};
 },[map,enabled]);
}
export function ProgramMirror({frame}:{frame:MirrorFrame}){
 const ref=useRef<HTMLDivElement>(null),[size,setSize]=useState({width:1,height:1}),[now,tick]=useState(Date.now);
 useEffect(()=>{const node=ref.current!;const observer=new ResizeObserver(()=>setSize({width:node.clientWidth,height:node.clientHeight}));observer.observe(node);const timer=setInterval(()=>tick(Date.now()),1000);return()=>{observer.disconnect();clearInterval(timer);};},[]);
 useEffect(()=>{ref.current?.querySelectorAll<HTMLImageElement>('[data-mirror-map]').forEach(image=>{if(image.getAttribute('src')!==frame.mapImage)image.src=frame.mapImage??'';});},[frame.html,frame.mapImage]);
 const scale=Math.min(size.width/Math.max(1,frame.width),size.height/Math.max(1,frame.height));
 return <div ref={ref} className="program-mirror"><div className="program-mirror-frame" style={{position:'absolute',width:frame.width,height:frame.height,left:(size.width-frame.width*scale)/2,top:(size.height-frame.height*scale)/2,transform:`scale(${scale})`,transformOrigin:'top left',pointerEvents:'none',overflow:'hidden'}} dangerouslySetInnerHTML={{__html:frame.html}}/>{now-frame.time>3000&&<div className="mirror-stalled">PROGRAM FEED INTERRUPTED</div>}</div>;
}
