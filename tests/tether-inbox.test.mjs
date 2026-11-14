import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {TetherInbox} from '../tether-inbox.mjs';

test('tether inbox detects stable delivered originals, not temporary/hidden files',async t=>{
  const home=await fsp.mkdtemp(path.join(os.tmpdir(),'fujix-tether-'));
  t.after(()=>fsp.rm(home,{recursive:true,force:true}));
  const dir=path.join(home,'Camera Imports');await fsp.mkdir(dir);
  const outside=path.join(home,'unrelated.jpg');await fsp.writeFile(outside,Buffer.alloc(300,0x42));
  await fsp.writeFile(path.join(dir,'DSCF1001.JPG'),Buffer.alloc(850,0x42));
  await fsp.writeFile(path.join(dir,'half.JPG.tmp'),Buffer.alloc(850,0x42));
  await fsp.writeFile(path.join(dir,'.hidden.JPG'),Buffer.alloc(850,0x42));
  await fsp.symlink(outside,path.join(dir,'symlink.JPG'));
  const inbox=new TetherInbox({home,stabilityMs:0});
  await inbox.configure(dir);
  assert.equal((await inbox.scan()).files.length,0,'first scan should not assume file is finished copying');
  const scanned=await inbox.scan();
  assert.equal(scanned.files.length,1);
  assert.equal(scanned.files[0].name,'DSCF1001.JPG');
  assert.equal(scanned.files[0].size,850);
  assert.equal(scanned.files[0].format,'jpg');
  const opened=await inbox.file(scanned.files[0].id);
  let received=0;for await(const chunk of opened.stream)received+=chunk.length;
  assert.equal(received,850);
  await assert.rejects(inbox.file('../../some-file'),/Invalid photo identifier/);
  await fsp.appendFile(path.join(dir,'DSCF1001.JPG'),Buffer.from([1,2,3]));
  await assert.rejects(inbox.file(scanned.files[0].id),/File changed/);
});

test('TetherInbox cannot be configured to watch unrelated system files or root',async()=>{
  const inbox=new TetherInbox();
  await assert.rejects(inbox.configure('/'),/Only folders/);
  await assert.rejects(inbox.configure('/etc'),/Only folders/);
  await assert.rejects(inbox.configure(''),/Choose an existing/);
});
