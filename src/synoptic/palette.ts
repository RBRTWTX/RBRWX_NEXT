import type {Product} from './model';
export const PRECIP_TYPES=[
 {value:1,label:'Warm stratiform rain',color:'#43bf68'},
 {value:3,label:'Snow',color:'#71c7ff'},
 {value:6,label:'Convective rain',color:'#ffcf35'},
 {value:7,label:'Rain / hail',color:'#dd57e3'},
 {value:10,label:'Cold stratiform rain',color:'#38b2b2'},
 {value:91,label:'Tropical / stratiform rain',color:'#ed9250'},
 {value:96,label:'Tropical / convective rain',color:'#f04845'},
];
export function stops(p:Product):{value:number;color:string}[]{
 if(p.id==='mrms-type')return PRECIP_TYPES;
 const colors=p.units==='dBZ'?['#204cb8','#20bfee','#28b838','#ffff35','#ff9b21','#e3292e','#ba28cb','#fff3ff']:
 p.id==='mrms-shear'?['#264dad','#4cbbdc','#cfedf3','#efefef','#f4b3a2','#e8684c','#ad2638']:
 p.units==='in'||p.units==='in/hr'?['#184d71','#278fd0','#36c79a','#afde57','#ffdb54','#ee7835','#dc326e','#ad58de']:
 ['#43348d','#3664bf','#4bb4d2','#6ac895','#ddd968','#eea24d','#e35048','#a32969'];
 const [low,high]=p.range??[0,100];return colors.map((color,i)=>({value:low+(high-low)*i/(colors.length-1),color}));
}
export function colorFor(p:Product,value:number):number[]|null{
 if(!Number.isFinite(value)||value<=-99)return null;
 if(p.id==='mrms-type'){const entry=PRECIP_TYPES.find(x=>x.value===value);return entry?rgb(entry.color):null;}
 if(p.family==='mrms'&&p.id!=='mrms-shear'&&value<=0)return null;
 const table=stops(p),i=Math.max(0,table.findIndex(x=>x.value>=value));
 if(value<=table[0].value)return rgb(table[0].color);if(value>=table.at(-1)!.value)return rgb(table.at(-1)!.color);
 const a=table[i-1],b=table[i],w=(value-a.value)/(b.value-a.value),ca=rgb(a.color),cb=rgb(b.color);return ca.map((v,c)=>v+(cb[c]-v)*w);
}
function rgb(c:string){return [1,3,5].map(i=>parseInt(c.slice(i,i+2),16));}
export function legendFor(p:Product){return p.id==='mrms-type'?PRECIP_TYPES.map(({label,color})=>({label,color})):stops(p).map(({value,color})=>({color,label:`${value.toFixed(p.units==='s⁻¹'?3:p.units==='in'||p.units==='in/hr'?1:0)} ${p.units}`}));}
