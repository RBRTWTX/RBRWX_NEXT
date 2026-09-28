import h5, { type Dataset } from 'h5wasm';
self.onmessage=async(event:MessageEvent<{files:ArrayBuffer[];start:number;end:number}>)=>{
 try{
  const {FS}=await h5.ready;const points:{lng:number;lat:number;time:number}[]=[];let coverage=0;
  for(let i=0;i<event.data.files.length;i++){
   const name=`/glm-${i}.nc`;FS.writeFile(name,new Uint8Array(event.data.files[i]));const file=new h5.File(name,'r');
   try{
    const lat=file.get('flash_lat') as Dataset,lon=file.get('flash_lon') as Dataset,t=file.get('flash_time_offset_of_first_event') as Dataset,q=file.get('flash_quality_flag') as Dataset;
    const lats=lat.value as Float32Array,lons=lon.value as Float32Array,times=t.value as Int16Array,quality=q.value as Int16Array;
    const num=(v:unknown)=>typeof v==='number'?v:Number((v as ArrayLike<number>)?.[0]);
    const scale=num(t.attrs.scale_factor.value),offset=num(t.attrs.add_offset.value),base=Date.parse(String(t.attrs.units.value).replace('seconds since ','').replace(' ','T')+'Z');
    const end=Date.parse(String(file.attrs.time_coverage_end.value));if(!Number.isFinite(base)||!Number.isFinite(end))throw Error('GLM observation time unavailable');coverage=Math.max(coverage,end);
    for(let j=0;j<lats.length;j++){const time=base+((times[j]&0xffff)*scale+offset)*1000;if(quality[j]===0&&time>=event.data.start&&time<=event.data.end&&Number.isFinite(lats[j])&&Number.isFinite(lons[j]))points.push({lng:lons[j],lat:lats[j],time});}
   }finally{file.close();FS.unlink(name);}
  }
  self.postMessage({points,coverage});
 }catch(e){self.postMessage({error:e instanceof Error?e.message:String(e)});}
};
