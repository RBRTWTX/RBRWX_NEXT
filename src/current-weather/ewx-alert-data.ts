export interface EwxAlert {id:string;event:string;area:string;headline:string;expires:number;sent:number;severity:string}
export function ewxAlerts(raw:unknown,now=Date.now()):EwxAlert[]{
 const data=raw as {features?:{id?:string;properties?:Record<string,any>}[]};
 if(!Array.isArray(data?.features))throw Error('Invalid NWS alert response');
 const result=new Map<string,EwxAlert>();
 for(const feature of data.features){const p=feature.properties??{};
  const office=/\bKEWX\b/.test(String(p.parameters?.WMOidentifier??''))||/^NWS Austin\/San Antonio TX$/i.test(p.senderName??'');
  const expires=Math.min(Date.parse(p.expires),p.ends?Date.parse(p.ends):Infinity),sent=Date.parse(p.sent);
  if(!office||p.status!=='Actual'||p.messageType==='Cancel'||!Number.isFinite(expires)||expires<=now||!Number.isFinite(sent)||sent>now+60000)continue;
  const id=String(feature.id??p.id??'');if(!id)continue;
  result.set(id,{id,event:String(p.event??'Weather alert'),area:String(p.areaDesc??''),headline:String(p.headline??''),expires,sent,severity:String(p.severity??'Unknown')});
 }
 const rank:Record<string,number>={Extreme:0,Severe:1,Moderate:2,Minor:3,Unknown:4};
 return [...result.values()].sort((a,b)=>(rank[a.severity]??4)-(rank[b.severity]??4)||b.sent-a.sent);
}
export async function fetchEwxAlerts(signal:AbortSignal){
 const response=await fetch('https://api.weather.gov/alerts/active?area=TX',{signal:AbortSignal.any([signal,AbortSignal.timeout(15000)]),headers:{Accept:'application/geo+json'},credentials:'omit',cache:'no-store'});
 if(!response.ok)throw Error(`NWS alerts HTTP ${response.status}`);
 const server=Date.parse(response.headers.get('Date')??'');if(Number.isFinite(server)&&Date.now()-server>300000)throw Error('NWS response is stale');
 return ewxAlerts(await response.json());
}
