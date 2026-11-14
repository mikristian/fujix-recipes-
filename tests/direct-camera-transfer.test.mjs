import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import {DirectCameraTransfer,validCameraEntry} from '../direct-camera-transfer.mjs';

const jpg=(seed,bytes=512)=>Buffer.concat([Buffer.from([0xff,0xd8]),Buffer.alloc(bytes-4,seed),Buffer.from([0xff,0xd9])]);
const item=(handle,name='DSCF0001.JPG',bytes=512)=>({handle,name,bytes});

test('new local captures import once; existing camera card photos are only baselined',async t=>{
  const home=await fsp.mkdtemp(path.join(os.tmpdir(),'fujix-camera-direct-'));
  t.after(()=>fsp.rm(home,{recursive:true,force:true}));
  const current=[item(1,'DSCF0001.JPG')];
  const bodies=new Map([[1,jpg(1)],[2,jpg(2)],[3,jpg(3)]]);
  let ready=true,downloads=0;
  const transfer=new DirectCameraTransfer({destination:home,ready:async()=>ready,
    list:async()=>({verified:true,items:[...current]}),
    download:async metadata=>{downloads++;return bodies.get(metadata.handle)},pollMs:30000});
  const initial=await transfer.start();
  assert.equal(initial.active,true);
  assert.equal(initial.imported,0);
  assert.equal(downloads,0);
  current.unshift(item(2,'DSCF0002.JPG'));
  await transfer.scan();
  assert.equal(transfer.status().imported,1);
  assert.equal(transfer.status().files[0].sourceName,'DSCF0002.JPG');
  const source=path.join(home,transfer.status().files[0].name);
  assert.deepEqual(await fsp.readFile(source),bodies.get(2));
  await transfer.scan();
  assert.equal(downloads,1,'repeated polls must not duplicate originals');
  ready=false;
  await assert.rejects(transfer.scan(),/paused/);
  assert.equal(downloads,1,'never touch camera when not ready');
  ready=true;
  current.unshift(item(3,'DSCF0003.JPG'));
  await transfer.scan();
  assert.equal(transfer.status().imported,2);
  assert.equal((await fsp.readdir(home)).length,2);
  await transfer.stop();
  assert.equal(transfer.status().active,false);
});

test('incomplete transfer is never saved, remains retryable on a later poll',async t=>{
  const home=await fsp.mkdtemp(path.join(os.tmpdir(),'fujix-incomplete-'));
  t.after(()=>fsp.rm(home,{recursive:true,force:true}));
  const current=[item(1)];let truncated=true;
  const transfer=new DirectCameraTransfer({destination:home,ready:async()=>true,
    list:async()=>({verified:true,items:[...current]}),
    download:async item=>truncated?Buffer.alloc(10):jpg(5,item.bytes),pollMs:30000});
  await transfer.start();current.unshift(item(2,'DSCF0002.JPG'));
  await assert.rejects(transfer.scan(),/incomplete original/);
  assert.deepEqual(await fsp.readdir(home),[]);
  truncated=false;await transfer.scan();
  assert.equal(transfer.status().imported,1);
  assert.equal((await fsp.readdir(home)).length,1);
  await transfer.stop();
});

test('camera auto-import refuses network-unverified and malformed image metadata',async()=>{
  assert.equal(validCameraEntry(item(1)),true);
  assert.equal(validCameraEntry(item(1,'../../../etc/passwd')),false);
  assert.equal(validCameraEntry(item(1,'DSCF0001.JPG',9)),false);
  assert.equal(validCameraEntry(item(1,'DSCF0001.MOV')),false);
  assert.equal(validCameraEntry(item(1,'DSCF0001.RAF',1024*1024)),true);
  const transfer=new DirectCameraTransfer({destination:os.tmpdir(),ready:async()=>false,
    list:async()=>{throw Error('camera should not have been contacted')},download:async()=>{throw Error('camera should not have been contacted')}});
  await assert.rejects(transfer.start(),/Connect the Mac/);
  assert.equal(transfer.status().active,false);
});

test('concurrent camera transfer start and stop never re-arm a canceled session',async()=>{
  let release;
  const block=new Promise(resolve=>release=resolve);
  const transfer=new DirectCameraTransfer({destination:os.tmpdir(),ready:async()=>true,
    list:async()=>{await block;return {verified:true,items:[item(1)]}},
    download:async()=>{throw Error('No download expected')}});
  const start=transfer.start();
  await assert.rejects(transfer.start(),/already in progress/);
  await Promise.resolve();
  const stop=transfer.stop();
  release();
  await assert.rejects(start,/stopped during initialization/);
  await stop;
  assert.equal(transfer.status().active,false);
  assert.equal(transfer.status().state,'off');
});
