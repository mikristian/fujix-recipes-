import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {server} from '../server.mjs';

let base;
test.before(async()=>{base=await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve('http://127.0.0.1:'+server.address().port)))});
test.after(async()=>{await new Promise(resolve=>server.close(resolve))});

test('LightCraft is the primary editor with integrated FujiX Camera + Recipes tab',async()=>{
  for(const route of ['/lightcraft','/lightcraft/']){
    const res=await fetch(base+route);
    assert.equal(res.status,200,route);
    const html=await res.text();
    assert.match(html,/<title>LightCraft × FujiX \| X100VI Editor<\/title>/);
    assert.match(html,/id="lightcraft_canvas"/,'real LightCraft WASM canvas must be preserved');
    assert.match(html,/id="lcx-camera"/);
    assert.match(html,/id="lcx-recipe-list"/);
    assert.match(html,/id="lcx-raf"/);
    assert.match(html,/id="lcx-filmkit"/);
    assert.match(html,/allow="usb;/,'FilmKit iframe must request WebUSB access under the same origin');
    assert.match(html,/src="\/lightcraft\/fujix.js\?v=1"/);
  }
});

test('Original LightCraft WASM modules are available with mandatory MIME types',async()=>{
  for(const [path,type] of [['/lightcraft/lightcraft_web_bg.wasm','application/wasm'],['/lightcraft/lightcraft_web.js','application/javascript'],['/lightcraft/worker.js','application/javascript'],['/lightcraft/LICENSE-MIT','application/octet-stream'],['/lightcraft/fujix.css','text/css']]){
    const r=await fetch(base+path,{method:'HEAD'});
    assert.equal(r.status,200,path);
    assert.equal(r.headers.get('content-type'),type,path);
    const len=Number(r.headers.get('content-length'));
    assert.ok(len>0,path);
  }
  const wasm=await fs.readFile(new URL('../web/lightcraft/lightcraft_web_bg.wasm',import.meta.url));
  assert.equal(wasm.subarray(0,4).toString('hex'),'0061736d','actual WebAssembly module');
});

test('LightCraft FujiX exposes all 101 personal film recipes through the existing catalog, not mock data',async()=>{
  const data=await (await fetch(base+'/recipes.json')).json();
  const all=(data.backups||[]).flatMap(b=>b.slots||[]);
  assert.equal(all.length,101);
  assert.ok(all.every(x=>x.name&&x.rawText&&x.id));
  const js=await (await fetch(base+'/lightcraft/fujix.js')).text();
  assert.match(js,/fetch\('\/recipes\.json'/);
  assert.match(js,/r\.rawText/,'original per-recipe text imported');
  assert.match(js,/paste-overlay/);
  assert.match(js,/paste-name/);
  assert.match(js,/paste-text/);
  assert.doesNotMatch(js,/paste-import'\)\.click\(/,'LightCraft cannot silently confirm a slot write');
  assert.match(js,/iframe\.src='\/film-lab\/'/,'FilmKit real camera UI stays inside LightCraft');
});

test('RAF catalog integration only reads originals with explicit user download',async()=>{
  const js=await (await fetch(base+'/lightcraft/fujix.js')).text();
  assert.match(js,/fetch\('\/api\/usb\/photos'/);
  assert.match(js,/r\.isOriginal===true/);
  assert.match(js,/\.raf\$/i);
  assert.match(js,/button\.addEventListener\('click'/);
  assert.match(js,/original\.id/);
  assert.doesNotMatch(js,/fetch\([^\n]*\bmethod:\s*['"]POST/);
  assert.doesNotMatch(js,/window\.location\.assign\('\/film-lab\/'\)/,'user stays in LightCraft');
});

test('Original LightCraft and FilmKit licensing accompanies the combined locally hosted app',async()=>{
  const lightcraft=await fs.readFile(new URL('../web/lightcraft/LICENSE-MIT',import.meta.url));
  assert.match(lightcraft.toString(),/ArtCraft Team/);
  const filmkit=await fs.readFile(new URL('../web/film-lab/FILMKIT-LICENSE.txt',import.meta.url));
  assert.match(filmkit.toString(),/eggricesoy/);
  const release=await fs.readFile(new URL('../research/lightcraft-v0.18.1/lightcraft-web-0.18.1.zip',import.meta.url));
  assert.equal(crypto.createHash('sha256').update(release).digest('hex'),'8b09f849dfeedf67cf1fd551361d9e5aafcce6e199157c250344dce01accfb64');
});
