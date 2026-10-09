import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const out=path.resolve(process.env.RBRWX_RENDER_OUT??'render-results');fs.mkdirSync(out,{recursive:true});
const server=await createServer({server:{hmr:false,watch:null,host:'127.0.0.1',port:1426,strictPort:true}});await server.listen();
let browser;const results=[];
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.RBRWX_CHROMIUM||undefined,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],proxy:process.env.HTTPS_PROXY?{server:process.env.HTTPS_PROXY,bypass:'localhost,127.0.0.1'}:undefined});
 const page=await browser.newPage({viewport:{width:960,height:600},ignoreHTTPSErrors:!!process.env.RBRWX_CHROMIUM});page.on('pageerror',e=>console.log('PAGE ERROR',e.message));
 await page.goto('http://127.0.0.1:1426/scripts/render/harness.html');await page.waitForFunction(()=>!!window.audit);
 const products=await page.evaluate(()=>window.audit.products);
 const selected=process.env.RBRWX_RENDER_PRODUCTS?.split(',')??products.filter(p=>p.kind!=='manual').map(p=>p.id);
 for(const id of selected){const started=Date.now();try{const result=await page.evaluate(async id=>id.startsWith('qpf:')?window.audit.qpf(id.slice(4)):id.startsWith('current:')?window.audit.imagery(id.slice(8)):window.audit.product(id),id);results.push({...result,seconds:(Date.now()-started)/1000});console.log(JSON.stringify(results.at(-1)));await page.screenshot({path:path.join(out,id.replaceAll(':','-')+'.png')});}catch(e){results.push({id,error:String(e)});console.log(JSON.stringify(results.at(-1)));}fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));}
 if(!process.env.RBRWX_RENDER_PRODUCTS){
 for(const id of ['day1','day2','day3','day7']){const r=await page.evaluate(id=>window.audit.qpf(id),id);results.push(r);console.log('QPF',JSON.stringify(r));}
 for(const id of ['radar','satellite','observations']){const r=await page.evaluate(id=>window.audit.imagery(id),id);results.push(r);console.log('CURRENT',JSON.stringify(r));}
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
 }
 const faults=await page.evaluate(()=>window.audit.faults());console.log('FAULT',JSON.stringify(faults));fs.writeFileSync(path.join(out,'faults.json'),JSON.stringify(faults,null,2));
 if(results.some(r=>r.error||r.loaded===false||(r.active&&(!r.issueTime||r.pixels===0))||r.status==='unavailable'))process.exitCode=1;
}finally{await browser?.close();await server.close();}
