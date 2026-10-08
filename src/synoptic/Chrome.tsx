import {EditableText} from '../broadcast-graphics/EditableText';
export {EditableText} from '../broadcast-graphics/EditableText';
import {ResizeBox} from '../broadcast-graphics/ResizeBox';
import {useEffect,useRef,useState,type PointerEvent,type CSSProperties} from 'react';
import type {SceneSettings} from './model';
export interface TitleLayout {x:number;y:number;width:number}
export const titleLayout=():TitleLayout=>({x:3,y:3,width:94});
export function layoutAfterDrag(start:TitleLayout,dx:number,dy:number,corner:string|undefined,canvas:{width:number;height:number},box:{width:number;height:number}):TitleLayout{
 const px=dx/canvas.width*100,py=dy/canvas.height*100;
 if(!corner)return {...start,x:Math.max(0,Math.min(100-start.width,start.x+px)),y:Math.max(0,Math.min(100-box.height/canvas.height*100,start.y+py))};
 const sx=corner.includes('w')?-1:1,sy=corner.includes('n')?-1:1;
 const factor=1+(sx*dx*box.width+sy*dy*box.height)/(box.width**2+box.height**2);
 const maxWidth=sx<0?start.x+start.width:100-start.x;
 const maxHeight=(sy<0?start.y+box.height/canvas.height*100:100-start.y)*canvas.height/100;
 const width=Math.max(20,Math.min(maxWidth,start.width*maxHeight/box.height,start.width*factor));
 const change=width/start.width;
 return {width,x:sx<0?start.x+start.width-width:start.x,y:sy<0?start.y+box.height/canvas.height*100*(1-change):start.y};
}
export function TitleBar({settings,title,time,legend,edit,appearance}:{settings:SceneSettings;title:string;time:string;appearance?:{design?:string;style?:CSSProperties};legend?:{color:string;label:string}[];edit?:(patch:Partial<SceneSettings>)=>void}){
 const layout=settings.barBoxes?.title??{...titleLayout(),...settings.titleLayout};
 const text=(id:string,value:string)=>settings.textOverrides?.[id]??value;
 const save=(id:string)=>edit?(value:string)=>edit({textOverrides:{...settings.textOverrides,[id]:value}}):undefined;
 return <ResizeBox className="synoptic-title-frame" label="title" box={layout} textOnly={settings.barStyles?.title?.textSizing}
 style={{'--box-width-compensation':94/layout.width} as CSSProperties}
 edit={edit?box=>edit({barBoxes:{...settings.barBoxes,title:box}}):undefined}>
  <header className="synoptic-title" data-bar-design={appearance?.design} style={appearance?.style}>
   <div className="synoptic-title-main"><strong><EditableText label="Title text" value={text('title',title)} edit={save('title')}/></strong><b><EditableText label="Valid time text" value={text('time',time)} edit={save('time')}/></b></div>
   {text('subtitle',settings.subtitle)&&<div className="synoptic-subtitle"><EditableText label="Subtitle text" value={text('subtitle',settings.subtitle)} edit={save('subtitle')}/></div>}
   {settings.legendVisible&&!!legend?.length&&<div className="synoptic-title-keys" aria-label="Title bar keys">{legend.map((item,i)=><span key={`${item.label}-${i}`}><i style={{background:item.color}}/><EditableText label={`Key ${item.label}`} value={text(`key:${item.label}`,item.label)} edit={save(`key:${item.label}`)}/></span>)}</div>}
  </header>
 </ResizeBox>;
}
