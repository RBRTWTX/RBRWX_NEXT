import {EditableText} from '../broadcast-graphics/EditableText';
import{BarLibrary}from'../broadcast-graphics/BarLibrary';
import{createContext,useContext,useEffect,useState,type ReactNode}from'react';
import{ResizeBox,type Box}from'../broadcast-graphics/ResizeBox';
import{barAttributes,type BarAppearance}from'../broadcast-graphics/barStyles';
import{fetchEwxAlerts,type EwxAlert}from'./ewx-alert-data';
import'./ewx-alerts.css';
export interface EwxState{enabled:boolean;items:EwxAlert[];checked:number;status:string;box:Box;style:BarAppearance;prefix:string}
const initial=():EwxState=>({enabled:false,items:[],checked:0,status:'OFF',box:{x:3,y:92,width:94,height:6},style:{design:'studio',top:'#791522',bottom:'#340713',accent:'#ff4455'},prefix:'NWS EWX'});
const Context=createContext<{state:EwxState;edit:(patch:Partial<EwxState>)=>void;refresh:()=>void}|null>(null);
export function useEwxAlerts(){const c=useContext(Context);if(!c)throw Error('EWX provider missing');return c;}
export function EwxProvider({children}:{children:ReactNode}){
 const[state,set]=useState(()=>{try{const saved=JSON.parse(localStorage.getItem('rbrwx-ewx-crawl-v1')??'{}');return{...initial(),box:saved.box??initial().box,style:saved.style??initial().style,prefix:typeof saved.prefix==='string'?saved.prefix:'NWS EWX'};}catch{return initial();}}),[revision,refresh]=useState(0);
 useEffect(()=>{try{localStorage.setItem('rbrwx-ewx-crawl-v1',JSON.stringify({box:state.box,style:state.style,prefix:state.prefix}));}catch{}},[state.box,state.style,state.prefix]);
 useEffect(()=>{if(!state.enabled){set(s=>({...s,items:[],checked:0,status:'OFF'}));return;}let stopped=false;let request:AbortController|null=null;
 const load=async()=>{if(request)return;request=new AbortController();try{const items=await fetchEwxAlerts(request.signal);if(!stopped)set(s=>({...s,items,checked:Date.now(),status:items.length?'LIVE':'NO ACTIVE EWX ALERTS'}));}catch(e){if(!stopped)set(s=>({...s,items:[],checked:0,status:'EWX ALERTS UNAVAILABLE'}));}finally{request=null;}};
 set(s=>({...s,status:'LOADING EWX ALERTS'}));void load();const timer=setInterval(()=>void load(),60000);return()=>{stopped=true;request?.abort();clearInterval(timer);};
 },[state.enabled,revision]);
 return <Context.Provider value={{state,edit:patch=>set(s=>({...s,...patch})),refresh:()=>refresh(n=>n+1)}}>{children}</Context.Provider>;
}
export function EwxControls(){const{state,edit,refresh}=useEwxAlerts();return <div className="ewx-controls"><label><input type="checkbox" checked={state.enabled} onChange={e=>edit({enabled:e.target.checked})}/>NWS EWX alert scroll</label><button onClick={refresh} disabled={!state.enabled}>Refresh EWX alerts</button><BarLibrary targets={['status']} value={{status:state.style}} onChange={s=>edit({style:s.status??initial().style})}/><span role="status">{state.status}{state.checked?` · checked ${new Date(state.checked).toLocaleTimeString()}`:''}</span></div>;}
export function EwxScroll({state,edit}:{state:EwxState;edit?:(patch:Partial<EwxState>)=>void}){
 const[now,tick]=useState(Date.now);useEffect(()=>{const id=setInterval(()=>tick(Date.now()),1000);return()=>clearInterval(id);},[]);
 if(!state.enabled)return null;
 const fresh=state.checked>0&&now-state.checked<300000,items=fresh?state.items.filter(a=>a.expires>now):[];
 const message=items.length?items.map(a=>`${a.event.toUpperCase()} · ${a.area} · ${a.headline} · Until ${new Date(a.expires).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`).join('     •     '):fresh?'NO ACTIVE EWX ALERTS':state.status==='LOADING EWX ALERTS'?state.status:'EWX ALERTS UNAVAILABLE';
 return <ResizeBox avoidCollisions className="ewx-alert-scroll" label="EWX alert scroll" box={state.box} textOnly={state.style.textSizing} edit={edit?box=>edit({box}):undefined}>
 <div className="ewx-alert-face" {...barAttributes(state.style)}><strong><EditableText label="Alert bar label" value={state.prefix} edit={edit?prefix=>edit({prefix}):undefined}/></strong><div className="ewx-alert-clip"><span key={message} className={items.length?'ewx-alert-crawl':''} style={{animationDuration:`${Math.max(35,message.length/9)}s`}}>{message}</span></div></div>
 </ResizeBox>;
}
export function LiveEwxScroll(){const{state,edit}=useEwxAlerts();return <EwxScroll state={state} edit={edit}/>;}
