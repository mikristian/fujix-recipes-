import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {USBPhotoLibrary,checkUsbPreviewJPEG,USB_JPEG_MAX_BYTES} from '../usb-photo-library.mjs';

const jpg=Buffer.concat([Buffer.from([0xff,0xd8]),Buffer.alloc(200,0),Buffer.from([0xff,0xd9])]);
test('only bounded JPEG preview buffers are accepted',()=>{
  assert.equal(checkUsbPreviewJPEG(jpg),true);
  assert.equal(checkUsbPreviewJPEG(Buffer.from('not a jpeg')),false);
  assert.equal(checkUsbPreviewJPEG(Buffer.alloc(USB_JPEG_MAX_BYTES+1)),false);
  assert.equal(checkUsbPreviewJPEG(Buffer.concat([jpg,Buffer.from([0])])),false);
});
test('camera live preview saves locally with unique safe names and no RAW claim',async t=>{
  const folder=await mkdtemp(join(tmpdir(),'fujix-usb-test-'));
  t.after(()=>rm(folder,{recursive:true,force:true}));
  const gallery=new USBPhotoLibrary(folder);
  const a=await gallery.save(jpg,{now:new Date('2026-11-01T02:00:00Z')});
  const b=await gallery.save(jpg,{now:new Date('2026-11-01T02:00:00Z')});
  assert.notEqual(a.name,b.name);
  assert.match(a.name,/^X100VI-USB-20261101-020000-[a-f0-9]{12}\.jpg$/);
  assert.equal(a.isOriginal,false);assert.equal(a.raf,false);
  const disk=await readFile(join(folder,a.name));assert.deepEqual(disk,jpg);
  const listing=await gallery.list();assert.equal(listing.count,2);
  const photo=await gallery.file(a.name);assert.equal(photo.bytes,jpg.length);
  assert.equal((await gallery.list({max:1})).photos.length,1);
});
test('reject invalid images before writing the camera folder',async t=>{
  const folder=await mkdtemp(join(tmpdir(),'fujix-usb-test-'));
  t.after(()=>rm(folder,{recursive:true,force:true}));
  const gallery=new USBPhotoLibrary(folder);
  await assert.rejects(gallery.save(Buffer.from('no')),/Invalid or oversized/);
  const listing=await gallery.list();assert.equal(listing.count,0);
});
test('gallery cannot access traversal paths, fake RAWs or unrelated private files',async t=>{
  const folder=await mkdtemp(join(tmpdir(),'fujix-usb-test-'));
  t.after(()=>rm(folder,{recursive:true,force:true}));
  const gallery=new USBPhotoLibrary(folder);
  await writeFile(join(folder,'not-a-camera-file.jpg'),jpg);
  await writeFile(join(folder,'X100VI-USB-20261101-020000-000000000000.raf'),jpg);
  assert.equal((await gallery.list()).count,0);
  await assert.rejects(gallery.file('../not-a-camera-file.jpg'),/Invalid/);
  await assert.rejects(gallery.file('X100VI-USB-20261101-020000-000000000000.raf'),/Invalid/);
});
