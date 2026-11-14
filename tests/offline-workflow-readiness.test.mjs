import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import {CAMERA_MODES,inspectOfflineReadiness} from '../offline-workflow-readiness.mjs';

test('camera mode registry distinguishes preview and originals',()=>{
  assert.equal(CAMERA_MODES.filter(x=>x.canImportOriginal).length,1);
  assert.equal(CAMERA_MODES.find(x=>x.id==='card-reader').cameraMode,'USB CARD READER');
  assert.equal(CAMERA_MODES.find(x=>x.id==='raw-conversion').cameraMode,'USB RAW CONV./BACKUP RESTORE');
});
test('offline inspection only reports verified local files and no imaginary camera original',async t=>{
  const home=await fs.mkdtemp(path.join(os.tmpdir(),'fujix-readiness-'));
  t.after(()=>fs.rm(home,{recursive:true,force:true}));
  const installed=path.join(home,'X RAW STUDIO.app');await fs.mkdir(installed);
  const incoming=path.join(home,'Pictures','FujiX Sync Incoming');await fs.mkdir(incoming,{recursive:true});
  await fs.writeFile(path.join(incoming,'DSCF0099.RAF'),'only-a-local-fixture');
  await fs.mkdir(path.join(home,'other'));
  await fs.symlink(path.join(home,'other'),path.join(incoming,'DSCF0100.RAF'));
  const photos={list:async()=>({folder:'custom',files:[{kind:'usb-preview',isOriginal:false,name:'preview.jpg'},{kind:'imported-original',isOriginal:true,name:'DSCF0022.RAF'},{kind:'imported-original',isOriginal:true,name:'DSCF0023.jpg'}]})};
  const result=await inspectOfflineReadiness({home,apps:{xRawStudio:installed,obs:path.join(home,'missing')},photoLibrary:photos,cameraVideo:{cameraPresent:true}});
  assert.equal(result.installed.xRawStudio,true);
  assert.equal(result.installed.obs,false);
  assert.equal(result.library.originalCount,2);
  assert.equal(result.library.rafCount,1);
  assert.equal(result.library.usbPreviewCount,1);
  assert.equal(result.library.incomingFileCount,1);
  assert.equal(result.usbCamera.enumerated,true);
  assert.equal(result.usbCamera.liveFramesVerified,false);
  assert.equal(result.fullResolutionCaptureVerified,false);
  assert.equal(result.recipesOnCameraVerified,false);
});
