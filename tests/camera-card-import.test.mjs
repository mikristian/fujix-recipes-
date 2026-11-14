import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import fsPromises from 'node:fs/promises';
import {CameraCardImport} from '../camera-card-import.mjs';

const jpeg=Buffer.concat([Buffer.from([255,216,255,224]),Buffer.alloc(512,9),Buffer.from([255,217])]);
const raf=Buffer.concat([Buffer.from('FUJIFILMCCD-RAW '),Buffer.alloc(800,12)]);

async function setup(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'fujix-card-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const volumeRoot=path.join(root,'Volumes'), destination=path.join(root,'Pictures','FujiX Sync','Originals');
  const mount=path.join(volumeRoot,'FUJI_CARD'),dir=path.join(mount,'DCIM','100_FUJI');
  await fs.mkdir(dir,{recursive:true});
  const importer=new CameraCardImport({volumeRoot,destination,allowFixtureMounts:true,maxBatchBytes:1024*1024});
  return {root,volumeRoot,mount,dir,destination,importer};
}

test('card discovery stays inert without a mounted DCIM card',async t=>{
  const {importer,volumeRoot}=await setup(t);
  assert.deepEqual((await importer.listMounts()).map(m=>m.name),['FUJI_CARD']);
  await fs.rm(path.join(volumeRoot,'FUJI_CARD'),{recursive:true});
  assert.deepEqual(await importer.listMounts(),[]);
  await assert.rejects(importer.scan(),/Choose an external camera card/);
  await assert.rejects(importer.selectMount('../Macintosh HD'),/Invalid card mount/);
});

test('card mount labels with spaces, such as macOS NO NAME, are allowed only after enumeration',async t=>{
  const {volumeRoot,destination,importer}=await setup(t);
  await fs.mkdir(path.join(volumeRoot,'NO NAME','DCIM'),{recursive:true});
  const listed=await importer.listMounts();
  assert.ok(listed.some(x=>x.name==='NO NAME'));
  const selected=await importer.selectMount('NO NAME');
  assert.equal(selected.selected,'NO NAME');
  await assert.rejects(importer.selectMount('../NO NAME'),/Invalid card mount/);
  assert.equal((await importer.scan()).count,0);
});

test('preview, streamed copy, hash verification and duplicate skip preserve source bytes',async t=>{
  const {dir,destination,importer}=await setup(t);
  const jpg=path.join(dir,'DSCF0001.JPG'),raw=path.join(dir,'DSCF0001.RAF');
  await fs.writeFile(jpg,jpeg);await fs.writeFile(raw,raf);
  await importer.selectMount('FUJI_CARD');
  const listing=await importer.scan();
  assert.equal(listing.count,2);
  assert.deepEqual(listing.files.map(f=>f.format).sort(),['JPG','RAF']);
  assert.ok(listing.files.every(f=>f.bytes>128&&f.relative.startsWith('DCIM/')));
  const first=await importer.importFiles(listing.files.map(f=>f.id));
  assert.equal(first.imported,2);assert.equal(first.skipped,0);
  for (const entry of first.files) {
    assert.match(entry.sha256,/^[a-f0-9]{64}$/);
    assert.deepEqual(await fs.readFile(path.join(destination,entry.savedName)),await fs.readFile(path.join(dir,entry.name)));
    assert.match(entry.savedName,/^X100VI-Original-[a-f0-9]{24}-DSCF0001\.(?:JPG|RAF)$/);
  }
  const again=await importer.importFiles(listing.files.map(f=>f.id));
  assert.equal(again.imported,0);assert.equal(again.skipped,2);
  assert.equal((await fs.readdir(destination)).length,2);
  assert.deepEqual(await fs.readFile(jpg),jpeg);
  assert.deepEqual(await fs.readFile(raw),raf);
});

test('ExFAT fallback imports originals safely when hard links are unavailable',async t=>{
  const {dir,destination,importer}=await setup(t);
  const source=path.join(dir,'DSCF0099.JPG');
  await fs.writeFile(source,jpeg);
  await importer.selectMount('FUJI_CARD');
  const {files}=await importer.scan();
  t.mock.method(fsPromises,'link',async()=>{
    const error=new Error('ExFAT hard links are unavailable');
    error.code='ENOTSUP';
    throw error;
  });
  const copied=await importer.importFiles([files[0].id]);
  assert.equal(copied.imported,1);
  assert.deepEqual(await fs.readFile(path.join(destination,copied.files[0].savedName)),jpeg);
  assert.deepEqual(await fs.readFile(source),jpeg);
  const repeated=await importer.importFiles([files[0].id]);
  assert.equal(repeated.imported,0);
  assert.equal(repeated.skipped,1);
});

test('symbolic links, internal-style mounts, unsupported formats and outside paths are denied',async t=>{
  const {dir,mount,volumeRoot,root,importer}=await setup(t);
  const outside=path.join(root,'outside.JPG');await fs.writeFile(outside,jpeg);
  await fs.symlink(outside,path.join(dir,'DSCF9999.JPG'));
  await fs.writeFile(path.join(dir,'DSCF9998.MOV'),jpeg);
  await fs.writeFile(path.join(dir,'DSCF9997.JPG'),jpeg);
  await fs.symlink(path.join(root,'invalid'),path.join(volumeRoot,'FAKE'));
  await fs.mkdir(path.join(volumeRoot,'NO_DCIM'));
  const mounts=await importer.listMounts();
  assert.deepEqual(mounts.map(m=>m.name),['FUJI_CARD']);
  await assert.rejects(importer.selectMount('NO_DCIM'),/not an allowed external/);
  await importer.selectMount('FUJI_CARD');
  assert.deepEqual((await importer.scan()).files.map(f=>f.name),['DSCF9997.JPG']);
  await fs.symlink(outside,path.join(mount,'DCIM','100_FUJI','OUTSIDE.JPG'));
  assert.equal((await importer.scan()).count,1);
  const guarded=new CameraCardImport({volumeRoot,destination:path.join(root,'archive')});
  assert.deepEqual(await guarded.listMounts(),[],'same-device folders must not be recognized as physical external mounts');
});

test('card file swap or modification after preview fails closed and leaves no destination file',async t=>{
  const {dir,destination,importer,root}=await setup(t);
  const file=path.join(dir,'DSCF0020.JPG');
  await fs.writeFile(file,jpeg);
  await importer.selectMount('FUJI_CARD');
  const {files}=await importer.scan();
  await fs.rm(file);
  await fs.symlink(path.join(root,'outside.JPG'),file);
  await assert.rejects(importer.importFiles([files[0].id]),/Unsafe card file/);
  const leftovers=await fs.readdir(destination);
  assert.deepEqual(leftovers,[]);
});

test('corrupted JPEG and over-budget batch do not publish originals',async t=>{
  const {dir,destination,importer}=await setup(t);
  await fs.writeFile(path.join(dir,'DSCF0003.JPG'),Buffer.alloc(512,4));
  await importer.selectMount('FUJI_CARD');
  const {files}=await importer.scan();
  await assert.rejects(importer.importFiles([files[0].id]),/signature/);
  assert.deepEqual(await fs.readdir(destination),[]);
  const limited=new CameraCardImport({volumeRoot:importer.volumeRoot,destination,allowFixtureMounts:true,maxBatchBytes:256});
  await limited.selectMount('FUJI_CARD');
  const scan=await limited.scan();
  await assert.rejects(limited.importFiles([scan.files[0].id]),/byte limit/);
});

test('removed mount requires re-selection and forbids stale scan import',async t=>{
  const {dir,mount,importer}=await setup(t);
  await fs.writeFile(path.join(dir,'DSCF0004.JPG'),jpeg);
  await importer.selectMount('FUJI_CARD');
  const {files}=await importer.scan();
  await fs.rm(mount,{recursive:true});
  await assert.rejects(importer.importFiles([files[0].id]),/disconnected/);
});
