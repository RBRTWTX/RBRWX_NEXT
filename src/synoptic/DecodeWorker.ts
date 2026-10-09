/** Reuse initialized WASM on successful frames; terminate on abort/error to stop CPU work. */
export class DecodeWorker {
 private worker:Worker|null=null;
 private cancel:(()=>void)|null=null;
 constructor(private factory:()=>Worker){}
 destroy(){this.cancel?.();this.worker?.terminate();this.worker=null;}
 run<T>(data:unknown,signal:AbortSignal,transfer:Transferable[]=[]):Promise<T>{
  this.cancel?.();
  return new Promise((resolve,reject)=>{
   if(signal.aborted){reject(new DOMException('Cancelled','AbortError'));return;}
   const worker=this.worker??=this.factory();let settled=false;
   const finish=(error?:Error,value?:T)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',cancel);worker.onmessage=null;worker.onerror=null;this.cancel=null;if(error){worker.terminate();this.worker=null;reject(error);}else resolve(value!);};
   const cancel=()=>finish(new DOMException('Cancelled','AbortError'));
   const timer=setTimeout(()=>finish(Error('Weather decode exceeded 45 seconds')),45000);
   this.cancel=cancel;worker.onmessage=e=>e.data.error?finish(Error(e.data.error)):finish(undefined,e.data);worker.onerror=e=>finish(Error(e.message));signal.addEventListener('abort',cancel,{once:true});
   try{worker.postMessage(data,transfer);}catch(error){finish(error as Error);}
  });
 }
}
