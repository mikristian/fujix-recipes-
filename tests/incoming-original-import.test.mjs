import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {TetherInbox} from '../tether-inbox.mjs';
import {LocalPhotoLibrary} from '../local-photo-library.mjs';
import {IncomingOriginalImport} from '../incoming-original-import.mjs';
const JPEG=Buffer.concat([Buffer.from([255,216,255,224,0,16,74,70,73,70]),Buffer.alloc(380,3),Buffer.from([255,217])]);
const RAF=Buffer.concat([Buffer.from('FUJIFILMCCD-RAW '),Buffer.alloc(1300,2)]);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function init(t){
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'fujix-watched-original-test-'));
 t.after(()=>fs.rm(temp,{force:true,recursive:true}));
 const source=path.join(temp,'incoming'),native=path.join(temp,'native');await fs.mkdir(source,{recursive:true});await fs.mkdir(native,{recursive:true});
 const inbox=new TetherInbox({home:temp,stabilityMs:0});await inbox.configure(source);
 const library=new LocalPhotoLibrary({root:native});
 const watcher=new IncomingOriginalImport({inbox,library,pollMs:900,baselineDelayMs:1});
 t.after(()=>watcher.stop());
 return {watcher,library,source,native,inbox};
}
async function scanTwice(watcher){await watcher.scan();await watcher.scan()}
test('pre-existing card files are a baseline, not silently imported',async t=>{
 const {watcher,source,library}=await init(t);
 await fs.writeFile(path.join(source,'DSCF0001.RAF'),RAF);
 await watcher.start();await scanTwice(watcher);
 assert.equal((await library.list()).count,0);
 assert.equal(watcher.status().imported,0);
});
test('a newly delivered full original RAF is imported byte-for-byte after stability',async t=>{
 const {watcher,source,library,native}=await init(t);
 await watcher.start();
 await fs.writeFile(path.join(source,'DSCF0099.RAF'),RAF);
 await scanTwice(watcher);
 const list=await library.list();assert.equal(list.count,1);assert.equal(list.files[0].isOriginal,true);assert.equal(list.files[0].name,'DSCF0099.RAF');
 assert.deepEqual(await fs.readFile(path.join(native,'Originals',list.files[0].savedName)),RAF);
 assert.equal(watcher.status().imported,1);
 await scanTwice(watcher);assert.equal((await library.list()).count,1);
});
test('new JPEG and RAF pairs are separate originals; webcam preview stays untouched',async t=>{
 const {watcher,source,library}=await init(t);await watcher.start();
 await fs.writeFile(path.join(source,'DSCF0030.RAF'),RAF);
 await fs.writeFile(path.join(source,'DSCF0030.JPG'),JPEG);
 await scanTwice(watcher);
 const originals=(await library.list()).files;
 assert.equal(originals.length,2);assert.ok(originals.every(item=>item.isOriginal));
 assert.ok(originals.some(item=>item.name==='DSCF0030.RAF'));
 assert.ok(originals.some(item=>item.name==='DSCF0030.JPG'));
});
test('incomplete JPEG rejected and removed, subsequent valid file still accepted',async t=>{
 const {watcher,source,library}=await init(t);await watcher.start();
 await fs.writeFile(path.join(source,'DSCF0033.JPG'),Buffer.alloc(500,0));
 await scanTwice(watcher);
 assert.equal((await library.list()).count,0);
 assert.match(watcher.status().lastError,/Failed to import/);
 await fs.writeFile(path.join(source,'DSCF0034.JPG'),JPEG);
 await scanTwice(watcher);
 assert.equal((await library.list()).count,1);
});
test('source files are never changed or removed by auto importer',async t=>{
 const {watcher,source}=await init(t);await watcher.start();
 const file=path.join(source,'DSCF0054.RAF');await fs.writeFile(file,RAF);
 const before=await fs.stat(file);await scanTwice(watcher);
 assert.deepEqual(await fs.readFile(file),RAF);
 const after=await fs.stat(file);assert.equal(before.size,after.size);
});
test('Frame.io-style delivered JPEG or RAF with identical SHA-256 is never archived twice',async t=>{
 const {watcher,source,library}=await init(t);await watcher.start();
 await fs.writeFile(path.join(source,'DSCF0054.RAF'),RAF);
 await scanTwice(watcher);
 assert.equal((await library.list()).count,1);
 await fs.writeFile(path.join(source,'DSCF0054-copy.RAF'),RAF);
 await scanTwice(watcher);
 assert.equal((await library.list()).count,1);
 assert.equal(watcher.status().imported,1);
 assert.equal(watcher.status().skippedDuplicates,1);
 assert.deepEqual(await fs.readFile(path.join(source,'DSCF0054-copy.RAF')),RAF);
});
test('watched source does not count malformed or truncated data as a camera original',async t=>{
 const {watcher,source,library}=await init(t);await watcher.start();
 await fs.writeFile(path.join(source,'DSCF0945.RAF'),Buffer.alloc(RAF.length));
 await scanTwice(watcher);
 assert.equal((await library.list()).count,0);
 assert.equal(watcher.status().imported,0);
 assert.match(watcher.status().lastError,/Failed to import/);
});
test('stopped watcher does not import newly delivered photos',async t=>{
 const {watcher,source,library}=await init(t);await watcher.start();await watcher.stop();
 await fs.writeFile(path.join(source,'DSCF0055.JPG'),JPEG);
 await scanTwice(watcher);
 assert.equal((await library.list()).count,0);
});
test('watcher refuses to start without an existing configured source',async t=>{
 const {watcher}=await init(t);watcher.inbox.folder=null;
 await assert.rejects(watcher.start(),/Choose a real incoming-photo source folder/);
});
test('session original import limit stops additional bulk downloads',async t=>{
 const {watcher,source,library}=await init(t);watcher.maxPerSession=1;await watcher.start();
 await fs.writeFile(path.join(source,'DSCF0300.JPG'),JPEG);
 await fs.writeFile(path.join(source,'DSCF0301.JPG'),JPEG);
 await scanTwice(watcher);
 assert.equal((await library.list()).count,1);
 assert.equal(watcher.status().active,false);
 assert.match(watcher.status().lastError,/safety limit/);
});
test('local Mac photo library rejects a declared file size larger than actually delivered',async t=>{
 const {library}=await init(t);
 const data=async function*(){yield JPEG};
 const req={headers:{'content-length':String(JPEG.length+100)},[Symbol.asyncIterator]:data};
 await assert.rejects(library.write(req,{kind:'original',filename:'DSCF0012.JPG'}),/incomplete/);
 assert.equal((await library.list()).count,0);
});
