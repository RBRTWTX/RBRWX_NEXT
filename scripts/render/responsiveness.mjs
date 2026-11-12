import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const baseline=process.argv.includes('--baseline');
const server=await createServer({server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});
await server.listen();
let browser;
try {
  browser=await chromium.launch({headless:true,executablePath:process.env.RBRWX_CHROMIUM||undefined});
  const page=await browser.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/responsiveness.html',r=>r.fulfill({contentType:'text/html',body:'<main id="root"></main><script type="module" src="/scripts/render/responsiveness.tsx"></script>'}));
  await page.goto(server.resolvedUrls.local[0]+'responsiveness.html');await page.waitForFunction(()=>typeof window.measureResponsiveness==='function');
  const result=await page.evaluate(()=>window.measureResponsiveness());console.log(JSON.stringify(result,null,2));
  assert.deepEqual(errors,[]);
  if(!baseline){
    assert.equal(result.unrelatedEditorRenders,0);assert.ok(result.undoWorked);assert.equal(result.titleOnlyStyleWrites,0);assert.ok(result.changedOpacityWrites>0);
    assert.equal(result.unchanged.raster,0);assert.equal(result.unchanged.labels,0);assert.equal(result.unchanged.notices,0);
    assert.deepEqual(result.units,{raster:0,labels:1});assert.deepEqual(result.pan,{raster:1,labels:0});
    assert.equal(result.expiredPixels,0);assert.equal(result.expiredLabels,0);
    assert.equal(result.syncMirrorEncodes,0);assert.ok(result.firstMirrorImage);assert.ok(result.finalMirrorImageChanged);
    assert.ok(result.mirrorImageSurvivesHeartbeat);assert.ok(result.sameMirrorNode);assert.equal(result.lastImagePixel,'0,128,0,255');
  }
} finally {await browser?.close();await server.close();}
