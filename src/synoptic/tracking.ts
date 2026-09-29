export type LonLat=[number,number];
export interface City{name:string;point:LonLat}
const rad=Math.PI/180;
export function distanceKm(a:LonLat,b:LonLat){const dlat=(b[1]-a[1])*rad,dlon=(b[0]-a[0])*rad,h=Math.sin(dlat/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(dlon/2)**2;return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));}
export function bearing(a:LonLat,b:LonLat){const d=(b[0]-a[0])*rad;return(Math.atan2(Math.sin(d)*Math.cos(b[1]*rad),Math.cos(a[1]*rad)*Math.sin(b[1]*rad)-Math.sin(a[1]*rad)*Math.cos(b[1]*rad)*Math.cos(d))/rad+360)%360;}
export function destination(a:LonLat,direction:number,km:number):LonLat{const t=km/6371,b=direction*rad,p=a[1]*rad,l=a[0]*rad,q=Math.asin(Math.sin(p)*Math.cos(t)+Math.cos(p)*Math.sin(t)*Math.cos(b)),r=l+Math.atan2(Math.sin(b)*Math.sin(t)*Math.cos(p),Math.cos(t)-Math.sin(p)*Math.sin(q));return[((r/rad+540)%360)-180,q/rad];}
export function cityTimings(origin:LonLat,toward:LonLat,mph:number,cities:City[]){if(!Number.isFinite(mph)||mph<=0||mph>150||distanceKm(origin,toward)<.1)return[];const direction=bearing(origin,toward),unique=new Map<string,{name:string;minutes:number;distance:number;point:LonLat}>();
 for(const city of cities){const km=distanceKm(origin,city.point),angle=(bearing(origin,city.point)-direction)*rad,along=km*Math.cos(angle),across=Math.abs(km*Math.sin(angle)),minutes=along/(mph*1.609344)*60;if(along<=0||across>15||minutes>120)continue;const next={name:city.name,minutes,distance:km,point:city.point};if(!unique.has(city.name)||unique.get(city.name)!.distance>km)unique.set(city.name,next);}
 return [...unique.values()].sort((a,b)=>a.minutes-b.minutes).slice(0,5);
}
