import {EditHistory} from './EditHistory';
import type {HistoryAction} from './sceneDocuments';
import {useRef,useEffect,useState,type ReactNode,type CSSProperties} from 'react';
export interface Box {x:number;y:number;width:number;height?:number;fontScale?:number}
export function resizeBox(start:Box,dx:number,dy:number,edge:string,canvas:{width:number;height:number},rect:{width:number;height:number},textOnly=false):Box {
 const px=dx/canvas.width*100,py=dy/canvas.height*100,h=start.height??rect.height/canvas.height*100;
 const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
 if(!edge)return {...start,x:clamp(start.x+px,0,100-start.width),y:clamp(start.y+py,0,100-h)};
 if(edge.length===2){const sx=edge.includes('w')?-1:1,sy=edge.includes('n')?-1:1;
  const factor=clamp(1+(sx*dx*rect.width+sy*dy*rect.height)/(rect.width**2+rect.height**2),.1,5);
  if(textOnly)return {...start,fontScale:clamp((start.fontScale??1)*factor,.25,4)};
  const width=clamp(start.width*factor,10,Math.min(sx<0?start.x+start.width:100-start.x,start.width*(sy<0?start.y+h:100-start.y)/h));
  const scale=width/start.width,height=h*scale;
  return {...start,width,height,fontScale:clamp((start.fontScale??1)*scale,.25,4),x:sx<0?start.x+start.width-width:start.x,y:sy<0?start.y+h-height:start.y};
 }
 if(textOnly)return {...start,fontScale:clamp((start.fontScale??1)*(1+(edge==='w'?-dx:edge==='e'?dx:edge==='n'?-dy:dy)/rect.width),.25,4)};
 if(edge==='e')return {...start,width:clamp(start.width+px,10,100-start.x)};
 if(edge==='w'){const width=clamp(start.width-px,10,start.x+start.width);return {...start,width,x:start.x+start.width-width};}
 if(edge==='s')return {...start,height:clamp(h+py,2,100-start.y)};
 const height=clamp(h-py,2,start.y+h);return {...start,height,y:start.y+h-height};
}
export function ResizeBox({history,box,edit,textOnly=false,label,children,className='',style={},avoidCollisions=false}:{history?:(action:HistoryAction)=>void;avoidCollisions?:boolean;box:Box;edit?:(box:Box)=>void;textOnly?:boolean;label:string;children:ReactNode;className?:string;style?:CSSProperties}){
 const ref=useRef<HTMLDivElement>(null),drag=useRef<{box:Box;x:number;y:number;edge:string;canvas:DOMRect;rect:DOMRect;text:boolean}|null>(null);
 const [controls,setControls]=useState(false);
 const [safeY,setSafeY]=useState<number|null>(null),[blocked,setBlocked]=useState(false);
 useEffect(()=>{if(!avoidCollisions){setSafeY(null);return;}const check=()=>{const node=ref.current,parent=node?.parentElement;if(!node||!parent)return;const canvas=parent.getBoundingClientRect(),own=node.getBoundingClientRect();if(!canvas.height)return;
 const bars=[...parent.querySelectorAll<HTMLElement>('.wx-resize-box')].filter(e=>e!==node&&!node.contains(e)).map(e=>e.getBoundingClientRect()).filter(r=>r.width>0&&r.height>0&&r.right>own.left&&r.left<own.right);
 const h=own.height/canvas.height*100,candidates=[box.y,...bars.flatMap(r=>[(r.bottom-canvas.top)/canvas.height*100+.8,(r.top-canvas.top)/canvas.height*100-h-.8]),0,100-h];
 const y=candidates.filter(y=>y>=0&&y+h<=100).sort((a,b)=>Math.abs(a-box.y)-Math.abs(b-box.y)).find(y=>bars.every(r=>canvas.top+(y+h)*canvas.height/100<=r.top-3||canvas.top+y*canvas.height/100>=r.bottom+3));
 setSafeY(y??null);setBlocked(y===undefined);};check();const timer=setInterval(check,200);return()=>clearInterval(timer);},[avoidCollisions,box.x,box.y,box.width,box.height]);
 return <div ref={ref} className={`wx-resize-box ${className}`} style={{...style,visibility:avoidCollisions&&blocked?'hidden':undefined,left:`${box.x}%`,top:`${safeY??box.y}%`,width:`${box.width}%`,height:box.height===undefined?undefined:`${box.height}%`,'--box-font-scale':box.fontScale??1} as CSSProperties}
 onContextMenu={e=>{if(!edit)return;e.preventDefault();e.stopPropagation();setControls(v=>!v);}}
 onPointerDown={e=>{if(!edit||e.button!==0||(e.target as HTMLElement).isContentEditable||(e.target as HTMLElement).closest('.wx-inline-controls'))return;const edge=(e.target as HTMLElement).dataset.edge??'';drag.current={box:{...box,y:safeY??box.y},x:e.clientX,y:e.clientY,edge,canvas:ref.current!.parentElement!.getBoundingClientRect(),rect:ref.current!.getBoundingClientRect(),text:textOnly||e.altKey};e.stopPropagation();}}
 onPointerMove={e=>{const d=drag.current;if(d&&Math.hypot(e.clientX-d.x,e.clientY-d.y)>3){e.stopPropagation();if(!e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.setPointerCapture(e.pointerId);edit?.(resizeBox(d.box,e.clientX-d.x,e.clientY-d.y,d.edge,d.canvas,d.rect,d.text));}}}
 onPointerUp={e=>{drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
 onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}>
 {children}
 {edit&&controls&&<div className="wx-inline-controls" style={box.y>60?{top:'auto',bottom:0}:undefined} role="group" aria-label={`${label} sizing`} onPointerDown={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape')setControls(false);}}>
 <label>Text size<input aria-label={`${label} text size`} type="range" min="25" max="400" value={Math.round((box.fontScale??1)*100)} onChange={e=>edit({...box,fontScale:Number(e.target.value)/100})}/></label>
 <label>Width<input aria-label={`${label} width`} type="range" min="10" max={100-box.x} value={box.width} onChange={e=>edit({...box,width:Number(e.target.value)})}/></label>
 {history&&<EditHistory act={history}/>}
 <span>Double-click text to edit. Drag edges to resize; Alt-drag sizes text.</span><button type="button" onClick={()=>setControls(false)}>Done</button>
 </div>}
 {edit&&['nw','n','ne','e','se','s','sw','w'].map(edge=><button key={edge} type="button" className={`wx-edge wx-edge-${edge}`} data-edge={edge} aria-label={`Resize ${label} ${edge}`} title={textOnly?'Drag to size text':'Drag side to change width; corner to scale. Alt-drag sizes text.'}
 onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const r=ref.current!;edit(resizeBox(box,e.key==='ArrowLeft'?-4:e.key==='ArrowRight'?4:0,e.key==='ArrowUp'?-4:e.key==='ArrowDown'?4:0,edge,r.parentElement!.getBoundingClientRect(),r.getBoundingClientRect(),textOnly||e.altKey));}}/>)}
 </div>;
}
