import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'fujix-http-archive-'));
process.env.FUJIX_PHOTO_ROOT=root;
const {server}=await import('../server.mjs');
const post=(base,route,body)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
let base;
test.before(async()=>{base=await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve('http://127.0.0.1:'+server.address().port)))});
test.after(async()=>{await new Promise(resolve=>server.close(resolve));await fs.rm(root,{force:true,recursive:true})});

test('photo archive status and report are inert until explicit request',async()=>{
 const state=await (await fetch(base+'/api/usb/photos/audit/status')).json();
 assert.equal(state.state,'idle');
 assert.equal(state.cameraConnected,false);
 assert.equal(state.reportAvailable,false);
 assert.equal((await fetch(base+'/api/usb/photos/audit/export')).status,409);
 assert.equal((await post(base,'/api/usb/photos/audit/start',{confirm:false})).status,409);
 assert.equal((await fetch(base+'/api/usb/photos/audit/status')).status,200);
});

test('explicit empty archive audit returns downloadable JSON without camera activity',async()=>{
 await fs.mkdir(path.join(root,'Originals'));
 await fs.mkdir(path.join(root,'Captures'));
 const started=await post(base,'/api/usb/photos/audit/start',{confirm:true});
 assert.equal(started.status,202);
 let status;
 for(let attempt=0;attempt<40;attempt++){
  status=await (await fetch(base+'/api/usb/photos/audit/status')).json();
  if(!status.running)break;
  await new Promise(r=>setTimeout(r,25));
 }
 assert.equal(status.state,'completed');
 assert.equal(status.summary.scanned,0);
 const receipt=await fetch(base+'/api/usb/photos/audit/export');
 assert.equal(receipt.status,200);
 assert.match(receipt.headers.get('content-disposition'),/attachment; filename="FujiX-Photo-Archive-Audit-/);
 const baseline=await receipt.json();
 const compare=await post(base,'/api/usb/photos/audit/compare',{receipt:baseline});
 assert.equal(compare.status,200);
 assert.deepEqual((await compare.json()).counts,{missing:0,added:0,changed:0,unchanged:0});
 const untrusted=await post(base,'/api/usb/photos/audit/compare',{receipt:{format:'wrong'}});
 assert.equal(untrusted.status,422);
 const forbidden=await fetch(base+'/api/usb/photos/audit/export',{headers:{Origin:'https://malicious.example'}});
 assert.equal(forbidden.status,403);
});
