import{useEffect,useRef,useState}from'react';
import type{Map as WeatherMap}from'maplibre-gl';
export interface MirrorFrame{html:string;width:number;height:number;time:number}
// Only application-rendered passive markup crosses the local canvas bridge.
export function passiveMarkup(root:HTMLElement){
 root.querySelectorAll('script,iframe,object,embed,audio,video,link,style,.canvas-hidden-menu,.forecast-add-menu,.forecast-asset-library,.forecast-editor-hint,.onair-tool-hint,.wx-edge,.forecast-resize-handle').forEach(n=>n.remove());
 root.querySelectorAll('*').forEach(node=>{for(const a of [...node.attributes])if(/^on/i.test(a.name)||['contenteditable','tabindex','autofocus'].includes(a.name)||(/^(href|src|xlink:href)$/i.test(a.name)&&/^\s*javascript:/i.test(a.value)))node.removeAttribute(a.name);});
 return root.innerHTML;
}
export function useProgramMirror(map:WeatherMap|null,enabled:boolean,publish:(frame:MirrorFrame)=>Promise<unknown>){
 const latest=useRef(publish);latest.current=publish;
 useEffect(()=>{if(!enabled)return;let busy=false,stopped=false,mapImage='',mapDirty=true;const retained=document.createElement('canvas');
 const rendered=()=>{const source=map?.getCanvas();if(!source?.width)return;try{if(retained.width!==source.width||retained.height!==source.height){retained.width=source.width;retained.height=source.height;}retained.getContext('2d')?.drawImage(source,0,0);mapDirty=true;}catch{mapImage='';}};
 map?.on('render',rendered);map?.triggerRepaint();
 const send=async()=>{if(stopped||busy)return;const stage=document.querySelector<HTMLElement>('.operator-canvas-stage');if(!stage)return;busy=true;try{
  const copy=stage.cloneNode(true) as HTMLElement;
  if(mapDirty&&retained.width&&retained.height){mapImage=retained.toDataURL('image/png');mapDirty=false;}
  copy.querySelectorAll('canvas').forEach(canvas=>{const image=document.createElement('img');image.className=canvas.className;image.setAttribute('style',canvas.getAttribute('style')??'');image.src=mapImage;image.alt='';canvas.replaceWith(image);});
  // Match crawl phase rather than restarting its animation on every bridge update.
  const crawls=stage.querySelectorAll<HTMLElement>('.ewx-alert-crawl');copy.querySelectorAll<HTMLElement>('.ewx-alert-crawl').forEach((node,i)=>{const time=Number(crawls[i]?.getAnimations()[0]?.currentTime??0);node.style.animationDelay=`-${time}ms`;});
  const rect=stage.getBoundingClientRect();await latest.current({html:passiveMarkup(copy),width:rect.width,height:rect.height,time:Date.now()});
 }catch{/* Next frame retries; receiver reports a stalled feed instead of claiming it is live. */}finally{busy=false;}};
 const timer=setInterval(()=>void send(),50);void send();return()=>{stopped=true;clearInterval(timer);map?.off('render',rendered);};
 },[map,enabled]);
}
export function ProgramMirror({frame}:{frame:MirrorFrame}){
 const ref=useRef<HTMLDivElement>(null),[size,setSize]=useState({width:1,height:1}),[now,tick]=useState(Date.now);
 useEffect(()=>{const node=ref.current!;const observer=new ResizeObserver(()=>setSize({width:node.clientWidth,height:node.clientHeight}));observer.observe(node);const timer=setInterval(()=>tick(Date.now()),1000);return()=>{observer.disconnect();clearInterval(timer);};},[]);
 const scale=Math.min(size.width/Math.max(1,frame.width),size.height/Math.max(1,frame.height));
 return <div ref={ref} className="program-mirror"><div className="program-mirror-frame" style={{position:'absolute',width:frame.width,height:frame.height,left:(size.width-frame.width*scale)/2,top:(size.height-frame.height*scale)/2,transform:`scale(${scale})`,transformOrigin:'top left',pointerEvents:'none',overflow:'hidden'}} dangerouslySetInnerHTML={{__html:frame.html}}/>{now-frame.time>3000&&<div className="mirror-stalled">PROGRAM FEED INTERRUPTED</div>}</div>;
}
