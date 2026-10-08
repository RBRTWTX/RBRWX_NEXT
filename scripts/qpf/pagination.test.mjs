import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('../broadcast/vendor/typescript/typescript.cjs');
const compile=(file,deps={})=>{const exports={};new Function('exports','require',ts.transpileModule(fs.readFileSync(new URL('../../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,id=>deps[id]??require(id));return exports;};
const model=compile('src/qpf/model.ts');
const {fetchCompleteQpf}=compile('src/qpf/controller.ts',{'./model':model});
const params=new URLSearchParams({where:'qpf > 0',outFields:'qpf,issue_time',returnGeometry:'true',outSR:'4326',f:'geojson'});
function service(t,{count=2001,limit=80,missing=false,mixed=false,error=false}={}){
 const calls=[];
 t.mock.method(globalThis,'fetch',async url=>{const q=new URL(url).searchParams;calls.push(q);if(error)return Response.json({error:{message:'Service unavailable'}});if(q.has('returnIdsOnly'))return Response.json({objectIdFieldName:'OBJECTID',objectIds:Array.from({length:count},(_,i)=>i+1)});
 const ids=q.get('objectIds').split(',').map(Number),truncated=ids.length>limit;
 return Response.json({type:'FeatureCollection',exceededTransferLimit:truncated,features:ids.slice(0,missing?ids.length-1:limit).map(id=>({type:'Feature',id,geometry:{type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,0]]]},properties:{OBJECTID:id,qpf:id%2?1:.1,issue_time:mixed&&id===2?'different':'same'}}))});});return calls;
}
test('loads every one of 2,001 features and splits truncated batches, sorted by amount',async t=>{const calls=service(t);const data=await fetchCompleteQpf('https://example.test/query',params,new AbortController().signal);assert.equal(data.features.length,2001);assert.equal(new Set(data.features.map(f=>f.id)).size,2001);assert.ok(calls.length>15);assert.equal(data.features[0].properties.qpf,.1);assert.equal(data.features.at(-1).properties.qpf,1);});
test('rejects missing features instead of painting an incomplete forecast',async t=>{service(t,{count:10,missing:true});await assert.rejects(fetchCompleteQpf('https://example.test/query',params,new AbortController().signal),/issuance changed/);});
test('rejects mixed issuances',async t=>{service(t,{count:10,mixed:true});await assert.rejects(fetchCompleteQpf('https://example.test/query',params,new AbortController().signal),/mixed issuances/);});
test('surfaces ArcGIS service errors',async t=>{service(t,{error:true});await assert.rejects(fetchCompleteQpf('https://example.test/query',params,new AbortController().signal),/Service unavailable/);});
test('abort prevents any request',async t=>{const calls=service(t);const abort=new AbortController();abort.abort();await assert.rejects(fetchCompleteQpf('https://example.test/query',params,abort.signal),{name:'AbortError'});assert.equal(calls.length,0);});
test('valid empty issuance clears old polygons',async t=>{service(t,{count:0});assert.deepEqual((await fetchCompleteQpf('https://example.test/query',params,new AbortController().signal)).features,[]);});
