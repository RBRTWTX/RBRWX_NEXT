import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const catalog = JSON.parse(await read('src/broadcast-graphics/keys/catalog.json'));
const manifest = JSON.parse(await read('docs/weather-keys/sources/manifest.json'));
for (const source of manifest.sources) assert.equal(createHash('sha256').update(await readFile(new URL(`docs/weather-keys/sources/${source.file}`, root))).digest('hex'), source.sha256, source.file);
// Decode NOAA's 8-bit RGBA legend swatches. Validate every bin, including transparency.
function pngCenter(data) {
  const png = Buffer.from(data, 'base64');
  assert.equal(png.readUInt32BE(16),20); assert.equal(png.readUInt32BE(20),20);
  assert.equal(png[24],8); assert.equal(png[25],6); assert.equal(png[28],0);
  const chunks=[];
  for(let p=8;p<png.length;) { const n=png.readUInt32BE(p); if(png.toString('ascii',p+4,p+8)==='IDAT') chunks.push(png.subarray(p+8,p+8+n)); p+=n+12; }
  const raw=inflateSync(Buffer.concat(chunks)), rows=[];
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<20;y++) { const row=Buffer.alloc(80), filter=raw[y*81]; assert.ok(filter<=4);
    for(let x=0;x<80;x++) { const a=x>=4?row[x-4]:0,b=y?rows[y-1][x]:0,c=y&&x>=4?rows[y-1][x-4]:0;
      row[x]=(raw[y*81+1+x]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter])&255; }
    rows.push(row);
  }
  return [...rows[10].subarray(40,44)];
}
assert.equal(new Set(catalog.map(k=>k.id)).size,catalog.length);
for(const key of catalog) {
  const record=manifest.sources.find(s=>s.url===key.source);assert.ok(record,key.id);
  const original=JSON.parse(await read(`docs/weather-keys/sources/${record.file}`));
  const values=key.sourceLayer!==undefined ? original.layers.find(l=>l.layerId===key.sourceLayer).legend : original.drawingInfo.renderer.uniqueValueInfos;
  assert.equal(values.length,key.bins.length,key.id);
  for(const bin of key.bins) {
    const value=values.find(v=>key.sourceLayer!==undefined?v.label===bin.label:v.value===bin.value);assert.ok(value,bin.label);
    assert.equal(value.label,bin.label);assert.deepEqual(bin.rgba,key.sourceLayer!==undefined?pngCenter(value.imageData):value.symbol.color,`${key.id}: ${bin.label}`);
  }
}
const ts=createRequire(import.meta.url)('../broadcast/vendor/typescript/typescript.cjs');
const source=(await read('src/broadcast-graphics/keys/model.ts')).replace("import catalog from './catalog.json';",`const catalog = ${JSON.stringify(catalog)};`);
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {resolveWeatherKey}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
for(const key of catalog) {assert.equal(resolveWeatherKey('auto',key.id)?.id,key.id);assert.equal(resolveWeatherKey(key.id,'unknown')?.id,key.id);assert.equal(resolveWeatherKey('none',key.id),undefined);}
for(const id of [undefined,'map.broadcast','map.satellite','Radar','unknown']) assert.equal(resolveWeatherKey('auto',id),undefined);
assert.equal(resolveWeatherKey('invalid','nws.ndfd.temperature'),undefined);
console.log(`Weather keys: ${catalog.length} palettes, all original NOAA bins/colors, auto/manual/none and unknown-product checks PASS`);
