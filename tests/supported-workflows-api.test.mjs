import test from 'node:test';
import assert from 'node:assert/strict';
import {server} from '../server.mjs';

async function withServer(run){
 if(server.listening)throw Error('Unexpected preexisting test server');
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port;
 try{await run(url)}
 finally{await new Promise(resolve=>server.close(resolve))}
}
const post=(url,payload)=>fetch(url,{
 method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
});

test('recipe backup is downloadable JSON, and restore preview does not modify local records',async()=>{
 await withServer(async base=>{
  const response=await fetch(base+'/api/recipe-hub/backup');
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-disposition'),/attachment; filename="FujiX-Sync-Local-Recipes-/);
  const backup=await response.json();
  assert.equal(backup.format,'fujix-sync-local-recipes');
  assert.equal(backup.version,1);
  assert.ok(Array.isArray(backup.recipes));
  const preview=await post(base+'/api/recipe-hub/backup/restore',{backup,apply:false});
  assert.equal(preview.status,200);
  const outcome=await preview.json();
  assert.equal(outcome.applied,false);
  assert.equal(outcome.added,0);
  assert.equal(outcome.existing,backup.recipes.length);
  const bad=await post(base+'/api/recipe-hub/backup/restore',{backup:{version:17,recipes:[]},apply:true});
  assert.equal(bad.status,422);
  const after=await (await fetch(base+'/api/recipe-hub/backup')).json();
  assert.deepEqual(after.recipes,backup.recipes);
 });
});

test('camera card mount listing is read-only; importing requires selection and confirmation',async()=>{
 await withServer(async base=>{
  const status=await (await fetch(base+'/api/usb/card-reader/status')).json();
  assert.equal(status.mode,'read-only-card-reader');
  assert.equal(status.importing,false);
  const response=await fetch(base+'/api/usb/card-reader/mounts');
  assert.equal(response.status,200);
  const list=await response.json();
  assert.ok(Array.isArray(list.mounts));
  const wrong=await post(base+'/api/usb/card-reader/select',{name:'../../Macintosh HD'});
  assert.equal(wrong.status,422);
  const forbidden=await post(base+'/api/usb/card-reader/import',{ids:[],confirm:false});
  assert.equal(forbidden.status,422);
  assert.match((await forbidden.json()).error,/Explicit confirmation/);
 });
});

test('USB video readiness never claims a photographic shutter or originals',async()=>{
 await withServer(async base=>{
  const response=await fetch(base+'/api/direct/usb/webcam/readiness');
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.detectionOnly,true);
  assert.equal(result.photographicShutterAvailable,false);
  assert.equal(result.originalJpegRafTransferAvailable,false);
  assert.equal(result.browserFramesVerified,false);
  assert.equal(result.requiredConnectionMode,'USB WEBCAM');
  const html=await (await fetch(base+'/')).text();
  assert.match(html,/supported-workflows\.mjs\?v=3/);
  assert.doesNotMatch(html,/<script[^>]*src="\/recipe-hub\.mjs/);
  const script=await fetch(base+'/supported-workflows.mjs');
  assert.equal(script.status,200);
  const source=await script.text();
  assert.match(source,/Import selected originals/);
  assert.match(source,/fujix-recipes-backup-open/);
  assert.match(source,/fujix-photo-audit-open/);
  assert.match(source,/Photo Archive Integrity/);
  assert.match(source,/Check USB camera connection/);
  assert.match(source,/server cannot access that USB cable over SSH/);
  assert.match(source,/Fujifilm USB PTP camera detected on this Mac, but no DCIM drive is mounted/);
  assert.match(source,/\/api\/usb\/card-reader\/open-image-capture/);
  assert.match(source,/Scan USB camera photos \(PTP\)/);
  assert.match(source,/\/api\/usb\/card-reader\/ptp-catalog\/start/);
  assert.match(source,/Import selected USB originals \(max 10\)/);
  assert.match(source,/\/api\/usb\/card-reader\/ptp-import\/start/);
  assert.match(source,/Stop after current file/);
 });
});

test('selected PTP camera imports require confirmation and report idle state without touching camera',async()=>{
 await withServer(async base=>{
  const status=await (await fetch(base+'/api/usb/card-reader/ptp-import/status')).json();
  assert.equal(status.state,'idle');
  assert.equal(status.cameraDeletes,false);
  assert.equal(status.maxSelected,10);
  const forbidden=await post(base+'/api/usb/card-reader/ptp-import/start',
    {confirm:false,ids:['a'.repeat(32)]});
  assert.equal(forbidden.status,409);
  const rejected=await forbidden.json();
  assert.match(rejected.error,/Explicit confirmation/);
  const after=await (await fetch(base+'/api/usb/card-reader/ptp-import/status')).json();
  assert.equal(after.state,'idle');
 });
});
