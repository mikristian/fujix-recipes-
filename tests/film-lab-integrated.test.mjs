import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {server} from '../server.mjs';

let base;
test.before(async()=>{
  base=await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve('http://127.0.0.1:'+server.address().port)));
});
test.after(async()=>{await new Promise(resolve=>server.close(resolve))});

test('FujiX Sync homepage exposes Film Lab in main navigation script',async()=>{
  const html=await (await fetch(base+'/')).text();
  assert.match(html,/film-lab-nav\.mjs/);
  assert.match(html,/film-lab-nav\.css/);
  assert.match(html,/library-tools\.mjs/,'existing Library Tools actions must remain accessible');
  assert.match(html,/library-tools\.css/);
  const js=await (await fetch(base+'/film-lab-nav.mjs')).text();
  assert.match(js,/findItem\('AI Chat'\)\|\|findItem\('ArtCraft'\)/,'Film Lab is added after the rightmost known built-in tab');
  assert.match(js,/last\.after\(item\)/);
  assert.match(js,/window\.location\.assign\('\/film-lab\/'\)/);
  assert.match(js,/last\.cloneNode\(true\)/,'Film Lab inherits original navigation layout and button classes');
  assert.match(js,/const after=before\.replace\(/,'cloned rightmost tab label must be explicitly changed to Film Lab');
  assert.match(js,/item\.setAttribute\('aria-label','Open Film Lab RAW photo editor'\)/);
});

test('Film Lab has an independent same-origin route, branded header, real editor controls',async()=>{
  for(const route of ['/film-lab','/film-lab/']){
    const res=await fetch(base+route);assert.equal(res.status,200,route);
    const html=await res.text();
    assert.match(html,/<title>Film Lab \| FujiX Sync<\/title>/);
    assert.match(html,/FUJIX SYNC/);
    assert.match(html,/id="btn-select-raf"/);
    assert.match(html,/id="film-sim"/);
    assert.match(html,/id="btn-save-preset"/);
    assert.match(html,/id="btn-render"/);
    assert.match(html,/id="result-download"/);
    assert.match(html,/id="compare-original"/);
    assert.match(html,/FILM LAB|Film Lab/);
  }
});

test('Built FilmKit WebUSB engine, assets, shell and MIT license resolve',async()=>{
  const html=await (await fetch(base+'/film-lab/')).text();
  const jsSrc=html.match(/src="(\/film-lab\/assets\/index-[\w-]+\.js)"/)?.[1];
  assert.ok(jsSrc,'real FilmKit compiled bundle must be included');
  for(const route of [jsSrc,'/film-lab/fujix-film-lab.css','/film-lab/fujix-film-lab.js','/film-lab/logo.svg','/film-lab/FILMKIT-LICENSE.txt']){
    const res=await fetch(base+route);assert.equal(res.status,200,route);
  }
  const compiled=await (await fetch(base+jsSrc)).text();
  assert.match(compiled,/requestDevice/);
  assert.match(compiled,/image\/jpeg/);
  assert.match(compiled,/fujix:archive-raf/,'FujiX archive import must call the real FilmKit RAF rendering entry point');
  assert.match(compiled,/fujix:archive-raf-result/,'Camera conversion result must be returned to the FujiX shell');
  const license=await (await fetch(base+'/film-lab/FILMKIT-LICENSE.txt')).text();
  assert.match(license,/Copyright \(c\) 2026 eggricesoy/);
});

test('Film Lab can browse only previously archived RAF originals without writing to the archive',async()=>{
  const html=await (await fetch(base+'/film-lab/')).text();
  assert.match(html,/id="fxlab-library-raf"/);
  assert.match(html,/id="fxlab-library-files"/);
  assert.match(html,/id="fxlab-library-develop" disabled/);
  assert.match(html,/Original RAFs stay unchanged/i);
  const js=await (await fetch(base+'/film-lab/fujix-film-lab.js')).text();
  assert.match(js,/fetch\('\/api\/usb\/photos'/);
  assert.match(js,/file\.isOriginal===true/,'exclude webcam previews and synthetic thumbnails');
  assert.match(js,/\.raf\$/i);
  assert.match(js,/fetch\('\/api\/usb\/photos\/file\/'\+selected\.id/);
  assert.match(js,/\{cache:'no-store'\}/);
  assert.match(js,/FUJIFILMCCD-RAW/,'check actual RAF bytes before camera transfer');
  assert.doesNotMatch(js,/fetch\([^\n]*\{method:'POST'/,'opening a RAF must never mutate photo archive');
  const adapter=await fs.readFile(new URL('../web/film-lab-shell/camera-library-adapter.ts',import.meta.url),'utf8');
  assert.match(adapter,/await doLoadRaf\(\)/);
  assert.doesNotMatch(adapter,/savePresets|setDevicePropValue|flash|writeFirmware|deleteFile/i,'archive bridge does not modify C slots, firmware or original files');
});

test('Camera behavior remains opt-in, pages do not claim a connected camera',async()=>{
  const html=await (await fetch(base+'/film-lab/')).text();
  assert.match(html,/CAMERA DISCONNECTED/);
  assert.match(html,/id="fxlab-open-raf" disabled/);
  assert.match(html,/Camera USB RAW CONV/);
  assert.doesNotMatch(html,/native USB tether unlocked/i);
  const app=await (await fetch(base+'/api/studio/readiness')).json();
  assert.equal(app.firmwareModified,false);
  assert.equal(app.fullResolutionCaptureVerified,false);
});

test('Film Lab packaging is reproducible and respects the source copy',async()=>{
  const manifest=await fs.readFile(new URL('../research/filmkit-upstream/package.json',import.meta.url),'utf8');
  assert.equal(JSON.parse(manifest).version,'0.3.2');
  const upstream=await fs.readFile(new URL('../research/filmkit-upstream/LICENSE',import.meta.url),'utf8');
  const bundled=await fs.readFile(new URL('../web/film-lab/FILMKIT-LICENSE.txt',import.meta.url),'utf8');
  assert.equal(bundled,upstream);
});
