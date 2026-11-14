import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';

const root=await fsp.mkdtemp(path.join(os.tmpdir(),'fujix-ptp-http-'));
process.env.FUJIX_PHOTO_ROOT=root;
const {server}=await import('../server.mjs');
let url='';
test.before(async()=>{url=await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve('http://127.0.0.1:'+server.address().port)))});
test.after(async()=>{await new Promise(resolve=>server.close(resolve));await fsp.rm(root,{recursive:true,force:true})});

function fixture(){
 return {format:'fujix-camera-ptp-presets',version:1,capturedAt:new Date().toISOString(),originalSlot:1,
  camera:{model:'X100VI',serial:'fake-for-test-only',firmware:'1.31',usbVendorId:0x04cb,usbProductId:0x0305},
  slots:Array.from({length:7},(_,i)=>({slot:i+1,name:'Test C'+(i+1),properties:Array.from({length:24},(_,j)=>({id:0xD18E+j,hex:j===4?'0b00':'0100',value:1}))}))};
}
test('localhost API saves complete camera-derived raw property backup with readback checksum and has no camera-write endpoint',async()=>{
 const body={snapshot:fixture()};
 const response=await fetch(url+'/api/studio/camera-presets/backup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal(response.status,201);
 const saved=await response.json();assert.equal(saved.stored,true);assert.equal(saved.slots,7);
 const check=await fetch(url+'/api/studio/camera-presets/backup/verify?id='+saved.id+'&sha256='+saved.sha256);
 assert.equal(check.status,200);assert.equal((await check.json()).verified,true);
 const disk=path.join(root,'Projects','CameraPresetBackups',saved.id+'.json');
 assert.equal(JSON.parse(await fsp.readFile(disk,'utf8')).slots.length,7);
 const absent=await fetch(url+'/api/studio/camera-presets/write',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
 assert.equal(absent.status,405,'server must not expose any camera-setting write endpoint');
});
test('spoofed camera snapshots and cross-origin backup requests are blocked',async()=>{
 const bad=fixture();bad.camera.model='X-T5';
 const response=await fetch(url+'/api/studio/camera-presets/backup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({snapshot:bad})});
 assert.equal(response.status,422);
 const other=await fetch(url+'/api/studio/camera-presets/backup',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://attacker.example'},body:JSON.stringify({snapshot:fixture()})});
 assert.equal(other.status,403);
});
