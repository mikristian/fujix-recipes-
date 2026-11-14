import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {LocalPhotoLibrary} from '../local-photo-library.mjs';
import {LocalCloudReceiver,safeOriginalFilename} from '../local-cloud-receiver.mjs';

const jpeg=Buffer.concat([Buffer.from([0xff,0xd8]),Buffer.alloc(350,1),Buffer.from([0xff,0xd9])]);

async function fixture(t){
 const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'fujix-local-cloud-'));
 const receiver=new LocalCloudReceiver({library:new LocalPhotoLibrary({root:path.join(dir,'library')}),port:0});
 const started=await receiver.start({host:'127.0.0.1'});
 const origin=started.url.slice(0,-1);
 t.after(async()=>{await receiver.stop();await fsp.rm(dir,{recursive:true,force:true})});
 return {receiver,started,origin,library:receiver.library};
}

test('local cloud is off by default and requires private or loopback interface',async()=>{
 const receiver=new LocalCloudReceiver({port:0});
 assert.equal(receiver.status().active,false);
 await assert.rejects(receiver.start({host:'8.8.8.8'}),/local IPv4/);
 await assert.rejects(receiver.start({host:'0.0.0.0'}),/local IPv4/);
 assert.equal(receiver.status().active,false);
});

test('receiver serves browser upload page but no pairing secret or camera-autosave claim',async t=>{
 const {started,origin}=await fixture(t);
 assert.equal(started.pairingKey.length,48);
 const page=await (await fetch(origin)).text();
 assert.match(page,/Send original RAW or JPEG/);
 assert.match(page,/does not connect directly to a Fujifilm camera/);
 assert.doesNotMatch(page,new RegExp(started.pairingKey));
 const js=await (await fetch(origin+'/client.js')).text();
 assert.match(js,/X-FujiX-Key/);
 const health=await (await fetch(origin+'/health')).json();
 assert.equal(health.cameraDirectUploadVerified,false);
 const unauth=await fetch(origin+'/api/status');
 assert.equal(unauth.status,401);
});

test('valid full JPEG arrives byte-for-byte in existing Mac Originals, without camera claims',async t=>{
 const {started,origin,library,receiver}=await fixture(t);
 let res=await fetch(origin+'/api/upload?name=DSCF1050.JPG',{
  method:'POST',headers:{'X-FujiX-Key':started.pairingKey,'Content-Type':'application/octet-stream'},body:jpeg});
 assert.equal(res.status,201);
 const output=await res.json();
 assert.equal(output.bytes,jpeg.length);
 assert.equal(output.name,'DSCF1050.JPG');
 assert.equal(receiver.status().received,1);
 assert.equal(receiver.status().cameraDirectUploadVerified,false);
 const listed=await library.list();
 assert.equal(listed.count,1);
 assert.equal(listed.files[0].isOriginal,true);
 const bytes=await fsp.readFile(path.join(listed.originalsFolder,listed.files[0].savedName));
 assert.deepEqual(bytes,jpeg);
 res=await fetch(origin+'/api/status',{headers:{'X-FujiX-Key':started.pairingKey}});
 assert.equal(res.status,200);
 assert.equal((await res.json()).received,1);
});

test('receiver preserves actual RAF-format bytes without converting them to a JPEG preview',async t=>{
 const {started,origin,library}=await fixture(t);
 const raf=Buffer.concat([Buffer.from('FUJIFILMCCD-RAW 0201','ascii'),Buffer.alloc(1024,17)]);
 const response=await fetch(origin+'/api/upload?name=DSCF1051.RAF',{
  method:'POST',headers:{'X-FujiX-Key':started.pairingKey},body:raf});
 assert.equal(response.status,201);
 const listing=await library.list();
 assert.equal(listing.count,1);
 assert.equal(listing.files[0].name,'DSCF1051.RAF');
 assert.equal(listing.files[0].previewUrl,null,'RAW must not be presented as a JPEG preview');
 assert.deepEqual(await fsp.readFile(path.join(listing.originalsFolder,listing.files[0].savedName)),raf);
});

test('missing key, invalid file, mismatched bytes and hostile browser origin fail closed',async t=>{
 const {started,origin,library,receiver}=await fixture(t);
 const pathName=origin+'/api/upload?name=DSCF1050.JPG';
 assert.equal((await fetch(pathName,{method:'POST',body:jpeg})).status,401);
 assert.equal((await fetch(pathName,{method:'POST',headers:{'X-FujiX-Key':started.pairingKey,Origin:'https://evil.example'},body:jpeg})).status,403);
 assert.equal((await fetch(origin+'/api/upload?name=..%2Fprivate%2Fsecret.RAF',{method:'POST',headers:{'X-FujiX-Key':started.pairingKey},body:jpeg})).status,415);
 assert.equal((await fetch(origin+'/api/upload?name=DSCF1050.MOV',{method:'POST',headers:{'X-FujiX-Key':started.pairingKey},body:jpeg})).status,415);
 assert.equal((await fetch(pathName,{method:'POST',headers:{'X-FujiX-Key':started.pairingKey},body:Buffer.alloc(400)})).status,422);
 assert.equal((await library.list()).count,0);
 assert.equal(receiver.status().received,0);
});

test('stop removes receiver and changes the key when started again',async t=>{
 const {started,receiver}=await fixture(t);
 await receiver.stop();
 assert.equal(receiver.status().active,false);
 assert.equal(receiver.status().url,null);
 const restarted=await receiver.start({host:'127.0.0.1'});
 assert.notEqual(started.pairingKey,restarted.pairingKey);
 assert.equal(restarted.cameraDirectUploadVerified,false);
});

test('safe filename checks reject ambiguous paths and unsupported formats',()=>{
 assert.equal(safeOriginalFilename('DSCF0100.RAF'),'DSCF0100.RAF');
 assert.equal(safeOriginalFilename('DSCF_1.HEIC'),'DSCF_1.HEIC');
 assert.equal(safeOriginalFilename('private/DSCF.RAF'),null);
 assert.equal(safeOriginalFilename('..\\DSCF.RAF'),null);
 assert.equal(safeOriginalFilename('.env'),null);
 assert.equal(safeOriginalFilename('video.mov'),null);
});
