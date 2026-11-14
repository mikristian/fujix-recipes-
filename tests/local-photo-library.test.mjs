import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import {Readable} from 'node:stream';
import {LocalPhotoLibrary} from '../local-photo-library.mjs';

const jpeg=Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0,0,16,74,70,73,70]),Buffer.alloc(512,4),Buffer.from([0xff,0xd9])]);
function req(body,headers={'content-type':'image/jpeg'}){const stream=Readable.from([body]);stream.headers={'content-length':String(body.length),...headers};return stream}
async function setup(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fujix-native-photo-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const photos=new LocalPhotoLibrary({root:dir});return {photos,dir}}

test('save a real JPEG-framed USB preview to a Mac Pictures-style directory',async t=>{
 const {photos,dir}=await setup(t);
 const photo=await photos.write(req(jpeg),{kind:'capture'});
 assert.equal(photo.kind,'usb-preview');assert.equal(photo.isOriginal,false);assert.equal(photo.bytes,jpeg.length);
 const list=await photos.list();assert.equal(list.count,1);assert.equal(list.files[0].id,photo.id);
 const saved=await fs.readFile(path.join(dir,'Captures',photo.savedName));assert.deepEqual(saved,jpeg);
 const selected=await photos.file(photo.id);assert.equal(selected.photo.isOriginal,false);
});
test('import a genuine complete JPEG original into a separate Originals folder',async t=>{
 const {photos,dir}=await setup(t);
 const imported=await photos.write(req(jpeg,{'content-type':'application/octet-stream'}),{kind:'original',filename:'DSCF0845.jpg'});
 assert.equal(imported.isOriginal,true);assert.equal(imported.name,'DSCF0845.jpg');
 assert.deepEqual(await fs.readFile(path.join(dir,'Originals',imported.savedName)),jpeg);
 const list=await photos.list();assert.equal(list.files[0].kind,'imported-original');
});
test('invalid JPEG data never leaves a partial Mac photo',async t=>{
 const {photos,dir}=await setup(t);
 await assert.rejects(photos.write(req(Buffer.alloc(450,16)),{kind:'capture'}),/valid JPEG/);
 assert.deepEqual(await fs.readdir(path.join(dir,'Captures')),[]);
});
test('unsupported original extension or file byte signature refused',async t=>{
 const {photos,dir}=await setup(t);
 await assert.rejects(photos.write(req(jpeg),{kind:'original',filename:'script.sh'}),/format/);
 await assert.rejects(photos.write(req(jpeg),{kind:'original',filename:'fake.raf'}),/header/);
 await photos.prepare();assert.deepEqual(await fs.readdir(path.join(dir,'Originals')),[]);
});
test('uploads cannot exceed declared max preview or original size',async t=>{
 const {photos}=await setup(t);
 const huge=req(jpeg);huge.headers['content-length']=String(14*1024*1024);
 await assert.rejects(photos.write(huge,{kind:'capture'}),/size/);
 const hugeOriginal=req(jpeg);hugeOriginal.headers['content-length']=String(201*1024*1024);
 await assert.rejects(photos.write(hugeOriginal,{kind:'original',filename:'DSCF0001.jpg'}),/size/);
});
test('photos cannot escape dedicated Finder photo folders via import filename',async t=>{
 const {photos,dir}=await setup(t);
 const original=await photos.write(req(jpeg),{kind:'original',filename:'../../../../private/../../photo.jpg'});
 assert.equal(original.name,'photo.jpg');
 assert.equal((await fs.readdir(path.join(dir,'Originals'))).length,1);
});
test('reject unknown ids and symlinks; never read outside the native library',async t=>{
 const {photos,dir}=await setup(t);
 await assert.rejects(photos.file('not-an-id'),/Invalid local photo ID/);
 const outside=await fs.mkdtemp(path.join(os.tmpdir(),'fujix-outside-'));
 t.after(()=>fs.rm(outside,{recursive:true,force:true}));
 await photos.prepare();await fs.writeFile(path.join(outside,'outside.jpg'),jpeg);
 await fs.symlink(path.join(outside,'outside.jpg'),path.join(dir,'Captures','X100VI-USB-0123456789abcdef01234567.jpg'));
 const list=await photos.list();assert.equal(list.count,0);
});
test('import RAF header without changing original camera data',async t=>{
 const {photos,dir}=await setup(t);
 const raw=Buffer.concat([Buffer.from('FUJIFILMCCD-RAW '),Buffer.alloc(1024,0),Buffer.from('end-original')]);
 const saved=await photos.write(req(raw),{kind:'original',filename:'DSCF9999.RAF'});
 assert.deepEqual(await fs.readFile(path.join(dir,'Originals',saved.savedName)),raw);
 assert.equal(saved.isOriginal,true);assert.equal(saved.mime,'application/octet-stream');
});
