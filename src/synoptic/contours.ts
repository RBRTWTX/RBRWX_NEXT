import type {FeatureCollection,Feature} from 'geojson';
/** Marching squares on a display grid. Coordinates follow the raster's Mercator sampling. */
export function analyzedObjects(values:Float32Array,width:number,height:number,bounds:number[],levels:number[]):FeatureCollection{
 const [west,south,east,north]=bounds,merc=(lat:number)=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360)),yn=merc(north),ys=merc(south);
 const position=(x:number,y:number)=>[west+(east-west)*(x+.5)/width,(2*Math.atan(Math.exp(yn+(ys-yn)*(y+.5)/height))-Math.PI/2)*180/Math.PI];
 const features:Feature[]=[];
 for(let y=45;y<height;y+=85)for(let x=45;x<width;x+=110){const v=values[y*width+x];if(Number.isFinite(v))features.push({type:'Feature',geometry:{type:'Point',coordinates:position(x,y)},properties:{_label:String(Math.round(v)),_color:'#ffffff',_analysis:true}});}
 const stride=6;
 for(const level of levels){const lines:number[][][]=[];
  for(let y=0;y<height-stride;y+=stride)for(let x=0;x<width-stride;x+=stride){
   const corners=[[x,y],[x+stride,y],[x+stride,y+stride],[x,y+stride]],v=corners.map(([a,b])=>values[b*width+a]);if(v.some(n=>!Number.isFinite(n)))continue;
   const crossings:number[][]=[];
   for(let edge=0;edge<4;edge++){const next=(edge+1)%4;if((v[edge]<level)===(v[next]<level))continue;const ratio=(level-v[edge])/(v[next]-v[edge]);crossings.push(position(corners[edge][0]+(corners[next][0]-corners[edge][0])*ratio,corners[edge][1]+(corners[next][1]-corners[edge][1])*ratio));}
   if(crossings.length===2)lines.push(crossings);else if(crossings.length===4){lines.push(crossings.slice(0,2),crossings.slice(2));}
  }
  if(lines.length)features.push({type:'Feature',geometry:{type:'MultiLineString',coordinates:lines},properties:{_contour:true,_label:String(level),_color:'#ffffff',_analysis:true}});
 }
 return {type:'FeatureCollection',features};
}
